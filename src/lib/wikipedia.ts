import { createServiceRoleClient } from "@/lib/supabase/server";
import type { WikipediaArticleTrend } from "@/lib/database.types";

const DAYS = 60;
const MAX_CANDIDATES = 9; // artist name + up to 8 albums
const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours, matching the pageviews API's own ~1 day lag

export type WikipediaTrends = {
  articles: WikipediaArticleTrend[];
  topMover: WikipediaArticleTrend | null;
};

function formatDate(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

type SearchResponse = { query?: { search?: { title?: string }[] } };

/** Resolves a free-text query to the real, canonically-titled Wikipedia
 * article Wikipedia's own search considers the best match — needed because
 * the pageviews API requires an exact existing title, not a guess. */
async function resolveArticleTitle(query: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1&origin=*`,
      { headers: { "User-Agent": "websitegenerator:cultural-intelligence:v1.0" } }
    );
    if (!res.ok) return null;
    const data: SearchResponse = await res.json();
    return data.query?.search?.[0]?.title ?? null;
  } catch {
    return null;
  }
}

type PageviewsResponse = { items?: { timestamp?: string; views?: number }[] };

/** Fetches the last DAYS of daily pageviews for one article. "all-access" +
 * "user" (excludes bots/spiders) gives a genuine human-attention signal.
 * Wikimedia's pageviews API is free and keyless. */
async function fetchDailyViews(title: string): Promise<number[] | null> {
  try {
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - DAYS);

    const article = encodeURIComponent(title.replace(/ /g, "_"));
    const res = await fetch(
      `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/${article}/daily/${formatDate(start)}00/${formatDate(end)}00`,
      { headers: { "User-Agent": "websitegenerator:cultural-intelligence:v1.0" } }
    );
    if (!res.ok) return null;
    const data: PageviewsResponse = await res.json();
    const items = data.items ?? [];
    return items.map((i) => i.views ?? 0);
  } catch {
    return null;
  }
}

async function fetchArticleTrend(query: string): Promise<WikipediaArticleTrend | null> {
  const title = await resolveArticleTitle(query);
  if (!title) return null;

  const dailyViews = await fetchDailyViews(title);
  if (!dailyViews || dailyViews.length < 7) return null;

  const last7 = dailyViews.slice(-7);
  const prev7 = dailyViews.slice(-14, -7);
  const last7DayViews = last7.reduce((s, v) => s + v, 0);
  const prev7DayViews = prev7.reduce((s, v) => s + v, 0);
  const changePct = prev7.length === 7 && prev7DayViews > 0 ? ((last7DayViews - prev7DayViews) / prev7DayViews) * 100 : null;

  return { title, last7DayViews, changePct, dailyViews };
}

async function computeWikipediaTrends(artistName: string, albumNames: string[]): Promise<WikipediaTrends> {
  const candidates = [
    artistName,
    ...albumNames.slice(0, MAX_CANDIDATES - 1).map((album) => `${album} ${artistName} album`),
  ];

  const results = await Promise.all(candidates.map((q) => fetchArticleTrend(q)));
  const seen = new Set<string>();
  const articles = results.filter((a): a is WikipediaArticleTrend => {
    if (!a || seen.has(a.title)) return false;
    seen.add(a.title);
    return true;
  });

  const withChange = articles.filter((a) => a.changePct !== null);
  const topMover =
    withChange.length > 0
      ? withChange.reduce((a, b) => (Math.abs(b.changePct!) > Math.abs(a.changePct!) ? b : a))
      : null;

  return { articles, topMover };
}

/** Computes fresh trends and persists them — same "compute now, store,
 * read back later" shape as every other refresh in this app (media,
 * sentiment, insights, etc.), rather than the previous unstable_cache
 * approach, which fully blocked the Dashboard's render on every cache miss
 * (including every deploy). Storing in a real table lets the page follow
 * the same block-only-if-never-computed / else-serve-cached-plus-
 * background-refresh pattern as everything else. */
export async function refreshWikipediaTrendsNow(
  artistId: string,
  artistName: string,
  albumNames: string[]
): Promise<WikipediaTrends> {
  const trends = await computeWikipediaTrends(artistName, albumNames);
  const supabase = createServiceRoleClient();
  await supabase.from("wikipedia_trends").upsert({
    artist_id: artistId,
    articles: trends.articles,
    top_mover: trends.topMover,
    computed_at: new Date().toISOString(),
  });
  return trends;
}

export async function refreshWikipediaTrendsIfStale(
  artistId: string,
  artistName: string,
  albumNames: string[]
) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("wikipedia_trends")
    .select("computed_at")
    .eq("artist_id", artistId)
    .maybeSingle();

  const isStale =
    !data?.computed_at || Date.now() - new Date(data.computed_at).getTime() > STALE_AFTER_MS;
  if (!isStale) return;

  try {
    await refreshWikipediaTrendsNow(artistId, artistName, albumNames);
  } catch (err) {
    console.error(`refreshWikipediaTrendsIfStale failed for artist ${artistId}:`, err);
  }
}
