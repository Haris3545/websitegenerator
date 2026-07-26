import { Type } from "@google/genai";
import { generateContentThrottled } from "@/lib/gemini";
import { createServiceRoleClient } from "@/lib/supabase/server";

const STALE_AFTER_MS = 12 * 60 * 60 * 1000; // 12 hours

type EventRow = {
  artist_id: string;
  event_date: string;
  venue: string;
  city: string;
  country: string;
  url: string | null;
  source: string;
  latitude: number | null;
  longitude: number | null;
  fetched_at: string;
};

type TicketmasterVenue = {
  name?: string;
  city?: { name?: string };
  country?: { name?: string };
  location?: { latitude?: string; longitude?: string };
};

type TicketmasterEvent = {
  url?: string;
  dates?: { start?: { localDate?: string; dateTime?: string } };
  _embedded?: { venues?: TicketmasterVenue[] };
};

type TicketmasterEventsResponse = {
  _embedded?: { events?: TicketmasterEvent[] };
};

/** Fetches upcoming tour dates from Ticketmaster's Discovery API — free,
 * instant, self-serve key, but skews toward bigger/ticketed venues. Used as
 * a structured, trustworthy base layer; fetchWebSearchEvents below fills in
 * the gaps it misses. */
async function fetchTicketmasterEvents(artistId: string, artistName: string): Promise<EventRow[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) return [];

  const url =
    `https://app.ticketmaster.com/discovery/v2/events.json` +
    `?apikey=${encodeURIComponent(apiKey)}&keyword=${encodeURIComponent(artistName)}&sort=date,asc&size=50`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ticketmaster returned ${res.status}`);

  const data: TicketmasterEventsResponse = await res.json();
  const events = data._embedded?.events ?? [];

  return events
    .map((e) => {
      const venue = e._embedded?.venues?.[0];
      const dateTime =
        e.dates?.start?.dateTime ??
        (e.dates?.start?.localDate ? `${e.dates.start.localDate}T00:00:00Z` : null);
      if (!dateTime || !venue?.name) return null;
      const lat = venue.location?.latitude ? Number(venue.location.latitude) : null;
      const lng = venue.location?.longitude ? Number(venue.location.longitude) : null;
      return {
        artist_id: artistId,
        event_date: dateTime,
        venue: venue.name,
        city: venue.city?.name ?? "",
        country: venue.country?.name ?? "",
        url: e.url ?? null,
        source: "ticketmaster",
        latitude: Number.isFinite(lat) ? lat : null,
        longitude: Number.isFinite(lng) ? lng : null,
        fetched_at: new Date().toISOString(),
      };
    })
    .filter((row): row is EventRow => row !== null);
}

const EXTRACTED_EVENTS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    events: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          date: { type: Type.STRING },
          venue: { type: Type.STRING },
          city: { type: Type.STRING },
          country: { type: Type.STRING },
          url: { type: Type.STRING },
        },
        required: ["date", "venue", "city"],
      },
    },
  },
  required: ["events"],
};

type ExtractedEvent = { date?: string; venue?: string; city?: string; country?: string; url?: string };

type GeocodeResult = { results?: { latitude?: number; longitude?: number }[] };

/** Free, keyless city → coordinates lookup, used only for web-search-found
 * events — Ticketmaster's own venue data already includes coordinates. */
async function geocodeCity(city: string, country: string): Promise<{ lat: number; lng: number } | null> {
  const query = country ? `${city}, ${country}` : city;
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`
    );
    if (!res.ok) return null;
    const data: GeocodeResult = await res.json();
    const first = data.results?.[0];
    if (typeof first?.latitude !== "number" || typeof first?.longitude !== "number") return null;
    return { lat: first.latitude, lng: first.longitude };
  } catch {
    return null;
  }
}

/** Finds upcoming tour dates a structured ticketing API wouldn't have —
 * smaller venues, regions Ticketmaster doesn't cover, etc. — by having
 * Gemini search the live web (Google Search grounding) and then extracting
 * structured data from what it found. This trades some of Ticketmaster's
 * per-event reliability for broader coverage: an LLM reading web pages can
 * misread a date or miss a cancellation in a way a real ticketing API
 * can't, which is why these rows are tagged source="web" rather than
 * blended in as if equally trustworthy. Uses GEMINI_API_KEY, already
 * required elsewhere in the app — no separate setup. */
async function fetchWebSearchEvents(artistId: string, artistName: string): Promise<EventRow[]> {
  const todayIso = new Date().toISOString().slice(0, 10);

  const searchRes = await generateContentThrottled({
    model: "gemini-2.5-flash-lite",
    contents:
      `Search the web for musical artist "${artistName}"'s upcoming, currently-scheduled live ` +
      `shows or tour dates from ${todayIso} onward. For each one, note the date, venue name, city, ` +
      "and country. Only include dates that look confirmed and upcoming — skip past shows, " +
      "rumored or unannounced dates, and anything you're not reasonably confident about. If you " +
      "find nothing reliable, say so plainly rather than guessing.",
    config: { tools: [{ googleSearch: {} }] },
  });
  const digest = searchRes.text ?? "";
  if (!digest.trim()) return [];

  const extractRes = await generateContentThrottled({
    model: "gemini-2.5-flash-lite",
    contents:
      "Extract upcoming show dates from this research into structured data. Only include entries " +
      "with a clear date, venue, and city; skip anything vague, already past, or uncertain. Dates " +
      `must be ISO 8601 (YYYY-MM-DD). Today is ${todayIso}.\n\nResearch:\n${digest}`,
    config: { responseMimeType: "application/json", responseSchema: EXTRACTED_EVENTS_SCHEMA },
  });

  const parsed = JSON.parse(extractRes.text ?? "{}");
  const extracted: ExtractedEvent[] = Array.isArray(parsed.events) ? parsed.events : [];

  const rows: EventRow[] = [];
  for (const e of extracted) {
    if (!e.date || !e.venue || !e.city) continue;
    const eventDate = `${e.date}T00:00:00Z`;
    if (Number.isNaN(Date.parse(eventDate)) || eventDate < `${todayIso}T00:00:00Z`) continue;

    const coords = await geocodeCity(e.city, e.country ?? "");
    rows.push({
      artist_id: artistId,
      event_date: eventDate,
      venue: e.venue,
      city: e.city,
      country: e.country ?? "",
      url: e.url ?? null,
      source: "web",
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      fetched_at: new Date().toISOString(),
    });
  }
  return rows;
}

/** Refreshes upcoming tour dates from both sources — best-effort each, so
 * one failing (no Ticketmaster key set, a Gemini hiccup) doesn't drop the
 * other's results. */
export async function refreshEventsForArtist(artistId: string, artistName: string) {
  const results = await Promise.allSettled([
    fetchTicketmasterEvents(artistId, artistName),
    fetchWebSearchEvents(artistId, artistName),
  ]);

  const rows: EventRow[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") rows.push(...result.value);
    else console.error(`refreshEventsForArtist: a source failed for ${artistName}:`, result.reason);
  }

  if (rows.length) {
    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("artist_events")
      .upsert(rows, { onConflict: "artist_id,event_date,venue" });
    if (error) throw new Error(error.message);
  }

  return rows.length;
}

/** Ticketmaster only, no Gemini call — used by "Refresh Everything" so that
 * button never burns Gemini quota. The web-search layer above still gets
 * refreshed on its own schedule via refreshEventsIfStale, triggered when
 * someone actually visits the Locations/Calendar tab. */
export async function refreshTicketmasterEventsOnly(artistId: string, artistName: string) {
  const rows = await fetchTicketmasterEvents(artistId, artistName);

  if (rows.length) {
    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("artist_events")
      .upsert(rows, { onConflict: "artist_id,event_date,venue" });
    if (error) throw new Error(error.message);
  }

  return rows.length;
}

export async function refreshEventsIfStale(artistId: string, artistName: string) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("artist_events")
    .select("fetched_at")
    .eq("artist_id", artistId)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isStale =
    !data?.fetched_at || Date.now() - new Date(data.fetched_at).getTime() > STALE_AFTER_MS;
  if (!isStale) return;

  try {
    await refreshEventsForArtist(artistId, artistName);
  } catch (err) {
    console.error(`refreshEventsIfStale failed for artist ${artistId}:`, err);
  }
}
