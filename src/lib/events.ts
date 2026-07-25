import { createServiceRoleClient } from "@/lib/supabase/server";

const STALE_AFTER_MS = 12 * 60 * 60 * 1000; // 12 hours

type TicketmasterVenue = {
  name?: string;
  city?: { name?: string };
  country?: { name?: string };
};

type TicketmasterEvent = {
  url?: string;
  dates?: { start?: { localDate?: string; dateTime?: string } };
  _embedded?: { venues?: TicketmasterVenue[] };
};

type TicketmasterEventsResponse = {
  _embedded?: { events?: TicketmasterEvent[] };
};

/** Fetches upcoming tour dates from Ticketmaster's Discovery API and caches
 * them. Ticketmaster's key is free, instant, and self-serve (no approval
 * wait like Bandsintown's app_id) — the tradeoff is it skews toward
 * bigger/ticketed venues rather than Bandsintown's broader indie-friendly
 * listings. */
export async function refreshEventsForArtist(artistId: string, artistName: string) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "TICKETMASTER_API_KEY isn't set — ask whoever manages this app's Vercel project to add it."
    );
  }

  const url =
    `https://app.ticketmaster.com/discovery/v2/events.json` +
    `?apikey=${encodeURIComponent(apiKey)}&keyword=${encodeURIComponent(artistName)}&sort=date,asc&size=50`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ticketmaster returned ${res.status}`);

  const data: TicketmasterEventsResponse = await res.json();
  const events = data._embedded?.events ?? [];

  const supabase = createServiceRoleClient();
  const rows = events
    .map((e) => {
      const venue = e._embedded?.venues?.[0];
      const dateTime =
        e.dates?.start?.dateTime ??
        (e.dates?.start?.localDate ? `${e.dates.start.localDate}T00:00:00Z` : null);
      if (!dateTime || !venue?.name) return null;
      return {
        artist_id: artistId,
        event_date: dateTime,
        venue: venue.name,
        city: venue.city?.name ?? "",
        country: venue.country?.name ?? "",
        url: e.url ?? null,
        source: "ticketmaster",
        fetched_at: new Date().toISOString(),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length) {
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
