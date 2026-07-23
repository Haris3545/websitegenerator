import { GoogleGenAI, Type } from "@google/genai";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { SentimentFilter, SentimentSummary } from "@/lib/database.types";

const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    positive_pct: { type: Type.NUMBER },
    negative_pct: { type: Type.NUMBER },
    neutral_pct: { type: Type.NUMBER },
    filters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["label", "keywords"],
      },
    },
  },
  required: ["positive_pct", "negative_pct", "neutral_pct", "filters"],
};

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/** Classifies overall sentiment across recent coverage and pulls out the
 * handful of topics/themes most obviously associated with it, for the
 * Dashboard tab's overview card + filter pills. */
export async function analyzeArtistSentiment(
  artistName: string,
  articles: { title: string; excerpt: string }[]
): Promise<SentimentSummary> {
  const computed_at = new Date().toISOString();

  if (!articles.length) {
    return { positive_pct: 0, negative_pct: 0, neutral_pct: 100, filters: [], computed_at };
  }

  const digest = articles
    .slice(0, 40)
    .map((a, i) => `${i + 1}. ${a.title}${a.excerpt ? ` — ${a.excerpt}` : ""}`)
    .join("\n");

  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents:
      `You're analyzing recent media coverage of the artist "${artistName}" for a marketing dashboard.\n\n` +
      "1. Estimate the overall sentiment split across all the coverage below as three percentages " +
      "(positive_pct, negative_pct, neutral_pct) that sum to roughly 100.\n" +
      "2. Identify 4-6 recurring topics/themes most obviously associated with this coverage (e.g. a tour, " +
      "an album, a controversy, a collaboration) as filters — each with a short label (2-4 words) and a " +
      "handful of keywords/phrases that would appear in an article about that topic.\n\n" +
      `Coverage:\n${digest}`,
    config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
  });

  const parsed = JSON.parse(response.text ?? "{}");
  const total =
    (parsed.positive_pct ?? 0) + (parsed.negative_pct ?? 0) + (parsed.neutral_pct ?? 0) || 100;

  return {
    positive_pct: Math.round(((parsed.positive_pct ?? 0) / total) * 100),
    negative_pct: Math.round(((parsed.negative_pct ?? 0) / total) * 100),
    neutral_pct: Math.round(((parsed.neutral_pct ?? 0) / total) * 100),
    filters: Array.isArray(parsed.filters)
      ? parsed.filters
          .slice(0, 6)
          .map((f: { label?: unknown; keywords?: unknown }) => ({
            label: String(f.label ?? "").slice(0, 40),
            keywords: Array.isArray(f.keywords) ? f.keywords.map(String).slice(0, 8) : [],
          }))
          .filter((f: SentimentFilter) => f.label)
      : [],
    computed_at,
  };
}

/** Recomputes and stores the sentiment summary right now, merging with
 * whatever's cached so manually-edited filters (see updateSentimentFilters
 * in s/[slug]/actions.ts) survive a recompute — only the percentages and
 * computed_at get refreshed unless there were no filters to keep. */
export async function refreshSentimentNow(artistId: string, artistName: string) {
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("sentiment_summary")
    .eq("id", artistId)
    .maybeSingle();

  const { data: articles } = await supabase
    .from("media_articles")
    .select("title, excerpt")
    .eq("artist_id", artistId)
    .order("published_at", { ascending: false })
    .limit(40);

  const summary = await analyzeArtistSentiment(artistName, articles ?? []);
  const existingFilters = artist?.sentiment_summary?.filters;

  await supabase
    .from("artists")
    .update({
      sentiment_summary: {
        ...summary,
        filters: existingFilters?.length ? existingFilters : summary.filters,
      },
    })
    .eq("id", artistId);
}

/** Refreshes the cached sentiment summary if it's stale or missing. Meant to
 * be called via next/server's after() so it never blocks a page render —
 * see (app)/page.tsx. */
export async function refreshSentimentIfStale(artistId: string, artistName: string) {
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("sentiment_summary")
    .eq("id", artistId)
    .maybeSingle();

  const computedAt = artist?.sentiment_summary?.computed_at;
  const isStale = !computedAt || Date.now() - new Date(computedAt).getTime() > STALE_AFTER_MS;
  if (!isStale) return;

  try {
    await refreshSentimentNow(artistId, artistName);
  } catch (err) {
    console.error(`refreshSentimentIfStale failed for artist ${artistId}:`, err);
  }
}
