import { createServiceRoleClient } from "@/lib/supabase/server";
import type { SearchTrendPoint } from "@/lib/database.types";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours — Google Trends itself only updates roughly daily

type SerpApiTrendsResponse = {
  interest_over_time?: {
    timeline_data?: {
      date?: string;
      values?: { extracted_value?: number; value?: string }[];
    }[];
  };
};

/** SerpApi's google_trends engine — real Google search-interest-over-time
 * (0-100, relative to the series' own peak), a genuinely different signal
 * from the Wikipedia pageviews proxy this app already tracks (people who
 * search for an artist don't all read their Wikipedia page, and vice
 * versa). Needs SERPAPI_KEY; throws on failure like the other paid-API
 * sources (Last.fm, Genius) so the Dashboard's empty state can say exactly
 * what's missing. */
async function fetchGoogleTrends(artistName: string, apiKey: string): Promise<SearchTrendPoint[]> {
  const res = await fetch(
    `https://serpapi.com/search.json?engine=google_trends&q=${encodeURIComponent(artistName)}&data_type=TIMESERIES&api_key=${apiKey}`
  );
  if (!res.ok) throw new Error(`SerpApi google_trends returned ${res.status}`);
  const data: SerpApiTrendsResponse = await res.json();

  const timeline = data.interest_over_time?.timeline_data ?? [];
  return timeline
    .map((point) => {
      const raw = point.values?.[0];
      const value = raw?.extracted_value ?? (raw?.value ? Number(raw.value) : null);
      return point.date && value !== null && !Number.isNaN(value)
        ? { date: point.date, value }
        : null;
    })
    .filter((p): p is SearchTrendPoint => p !== null);
}

export async function refreshSearchTrendsNow(
  artistId: string,
  artistName: string
): Promise<SearchTrendPoint[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    throw new Error("SERPAPI_KEY isn't set — ask whoever manages this app's Vercel project to add it.");
  }

  const points = await fetchGoogleTrends(artistName, apiKey);

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("search_trends").upsert({
    artist_id: artistId,
    points,
    computed_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  return points;
}

export async function refreshSearchTrendsIfStale(artistId: string, artistName: string) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("search_trends")
    .select("computed_at")
    .eq("artist_id", artistId)
    .maybeSingle();

  const isStale =
    !data?.computed_at || Date.now() - new Date(data.computed_at).getTime() > STALE_AFTER_MS;
  if (!isStale) return;

  try {
    await refreshSearchTrendsNow(artistId, artistName);
  } catch (err) {
    console.error(`refreshSearchTrendsIfStale failed for artist ${artistId}:`, err);
  }
}
