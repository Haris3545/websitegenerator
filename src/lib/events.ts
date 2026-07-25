import { createServiceRoleClient } from "@/lib/supabase/server";
import { getArtistSecret } from "@/lib/secrets";

const STALE_AFTER_MS = 12 * 60 * 60 * 1000; // 12 hours

type BandsintownVenue = {
  name?: string;
  city?: string;
  country?: string;
};

type BandsintownEvent = {
  datetime?: string;
  url?: string;
  venue?: BandsintownVenue;
};

/** Fetches upcoming tour dates from Bandsintown's public events API and
 * caches them. Requires a Bandsintown app_id (see the artist's "Data source
 * API keys" in the builder) — Bandsintown ties rate limits/access to a
 * registered app_id, so there's no reasonable default that works for
 * everyone. */
export async function refreshEventsForArtist(artistId: string, artistName: string) {
  const appId = await getArtistSecret(artistId, "bandsintown_app_id");
  if (!appId) {
    throw new Error(
      "No Bandsintown app_id set for this artist — add one under \"Data source API keys\" in the builder."
    );
  }

  const url =
    `https://rest.bandsintown.com/artists/${encodeURIComponent(artistName)}/events` +
    `?app_id=${encodeURIComponent(appId)}&date=upcoming`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Bandsintown returned ${res.status}`);

  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    // Bandsintown returns a JSON object (not an array) for an unrecognized
    // artist or an invalid app_id, rather than an HTTP error.
    return 0;
  }

  const supabase = createServiceRoleClient();
  const rows = (data as BandsintownEvent[])
    .filter((e) => e.datetime && e.venue?.name)
    .map((e) => ({
      artist_id: artistId,
      event_date: e.datetime as string,
      venue: e.venue!.name as string,
      city: e.venue?.city ?? "",
      country: e.venue?.country ?? "",
      url: e.url ?? null,
      source: "bandsintown",
      fetched_at: new Date().toISOString(),
    }));

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
