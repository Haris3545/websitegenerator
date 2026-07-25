import { Type } from "@google/genai";
import { generateContentThrottled } from "@/lib/gemini";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ArtistInsight } from "@/lib/database.types";

const STALE_AFTER_MS = 12 * 60 * 60 * 1000; // 12 hours

type Metrics = {
  media_count: number;
  sentiment_positive_pct: number | null;
  sentiment_negative_pct: number | null;
  youtube_subscribers: number | null;
  youtube_views: number | null;
  music_listeners: number | null;
  music_playcount: number | null;
  social_comments_count: number;
  audience_statements_count: number;
  upcoming_events_count: number;
};

async function captureMetricSnapshot(artistId: string): Promise<Metrics> {
  const supabase = createServiceRoleClient();

  const [
    { count: mediaCount },
    { data: artistRow },
    { data: youtubeStats },
    { data: musicStats },
    { data: socialCommentMap },
    { count: audienceCount },
    { count: eventsCount },
  ] = await Promise.all([
    supabase.from("media_articles").select("id", { count: "exact", head: true }).eq("artist_id", artistId),
    supabase.from("artists").select("sentiment_summary").eq("id", artistId).maybeSingle(),
    supabase.from("youtube_stats").select("subscriber_count, view_count").eq("artist_id", artistId).maybeSingle(),
    supabase.from("music_stats").select("listeners, playcount").eq("artist_id", artistId).maybeSingle(),
    supabase.from("social_comment_map").select("comment_count").eq("artist_id", artistId).maybeSingle(),
    supabase.from("audience_statements").select("id", { count: "exact", head: true }).eq("artist_id", artistId),
    supabase
      .from("artist_events")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", artistId)
      .gte("event_date", new Date().toISOString()),
  ]);

  const metrics: Metrics = {
    media_count: mediaCount ?? 0,
    sentiment_positive_pct: artistRow?.sentiment_summary?.positive_pct ?? null,
    sentiment_negative_pct: artistRow?.sentiment_summary?.negative_pct ?? null,
    youtube_subscribers: youtubeStats?.subscriber_count ?? null,
    youtube_views: youtubeStats?.view_count ?? null,
    music_listeners: musicStats?.listeners ?? null,
    music_playcount: musicStats?.playcount ?? null,
    social_comments_count: socialCommentMap?.comment_count ?? 0,
    audience_statements_count: audienceCount ?? 0,
    upcoming_events_count: eventsCount ?? 0,
  };

  await supabase.from("artist_metric_snapshots").insert({ artist_id: artistId, metrics });
  return metrics;
}

const INSIGHTS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    insights: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          headline: { type: Type.STRING },
          detail: { type: Type.STRING },
          basis: { type: Type.STRING },
        },
        required: ["headline", "detail", "basis"],
      },
    },
  },
  required: ["insights"],
};

/** Recomputes the Dashboard's insight cards. Numbers and deltas are
 * computed here in plain code from real stored data — Gemini's only job is
 * turning already-verified facts into short, readable cards, never
 * inventing the facts themselves. The prompt hands it a JSON blob of
 * exactly what's true and instructs it to skip anything not present rather
 * than speculate, so a claim like "streams up 12%" only ever appears when
 * there's a real prior snapshot to compare against. */
export async function refreshInsightsNow(artistId: string, artistName: string) {
  const supabase = createServiceRoleClient();

  const { data: previous } = await supabase
    .from("artist_metric_snapshots")
    .select("metrics, captured_at")
    .eq("artist_id", artistId)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentMetrics = await captureMetricSnapshot(artistId);

  const changes: Record<string, number> = {};
  if (previous?.metrics) {
    for (const key of Object.keys(currentMetrics) as (keyof Metrics)[]) {
      const before = previous.metrics[key];
      const after = currentMetrics[key];
      if (typeof before === "number" && typeof after === "number" && before !== after) {
        changes[key] = after - before;
      }
    }
  }

  const [
    { data: recentArticles },
    { data: musicRow },
    { data: commentMap },
    { data: nextEvents },
    { data: audienceTop },
    { data: artistRow },
  ] = await Promise.all([
    supabase
      .from("media_articles")
      .select("title, source")
      .eq("artist_id", artistId)
      .order("published_at", { ascending: false })
      .limit(8),
    supabase.from("music_stats").select("top_tracks, top_tags, top_albums").eq("artist_id", artistId).maybeSingle(),
    supabase.from("social_comment_map").select("categories").eq("artist_id", artistId).maybeSingle(),
    supabase
      .from("artist_events")
      .select("event_date, venue, city, country")
      .eq("artist_id", artistId)
      .gte("event_date", new Date().toISOString())
      .order("event_date", { ascending: true })
      .limit(5),
    supabase
      .from("audience_statements")
      .select("statement, segment, index_value")
      .eq("artist_id", artistId)
      .order("index_value", { ascending: false, nullsFirst: false })
      .limit(6),
    supabase.from("artists").select("sentiment_summary").eq("id", artistId).maybeSingle(),
  ]);

  const topCommentThemes = (commentMap?.categories ?? [])
    .map((c) => ({
      theme: c.name,
      comment_count: c.subcategories.reduce((sum, s) => sum + s.comments.length, 0),
      example_subcategories: c.subcategories.slice(0, 3).map((s) => s.name),
    }))
    .sort((a, b) => b.comment_count - a.comment_count)
    .slice(0, 6);

  const { positive_pct, neutral_pct, negative_pct } = artistRow?.sentiment_summary ?? {};
  const hasSentimentBreakdown =
    typeof positive_pct === "number" && (positive_pct > 0 || neutral_pct! > 0 || negative_pct! > 0);

  // Deezer albums are already sorted newest-first (see music.ts), so the
  // first entry genuinely is the latest release — safe to hand Gemini as a
  // real fact, not a guess.
  const latestAlbum = musicRow?.top_albums?.[0]?.name ?? null;

  const facts = {
    artist_name: artistName,
    current_metrics: currentMetrics,
    changes_since_last_check: Object.keys(changes).length ? changes : null,
    days_since_last_check: previous
      ? Math.max(0, Math.round((Date.now() - new Date(previous.captured_at).getTime()) / 86_400_000))
      : null,
    media_sentiment_breakdown: hasSentimentBreakdown ? { positive_pct, neutral_pct, negative_pct } : null,
    latest_album: latestAlbum,
    recent_headlines: recentArticles ?? [],
    top_tracks: musicRow?.top_tracks?.slice(0, 5) ?? [],
    top_tags: musicRow?.top_tags ?? [],
    top_comment_themes: topCommentThemes,
    upcoming_shows: nextEvents ?? [],
    top_audience_segments: audienceTop ?? [],
  };

  const hasAnyData =
    Object.values(currentMetrics).some((v) => typeof v === "number" && v > 0) ||
    facts.recent_headlines.length > 0 ||
    facts.top_tracks.length > 0 ||
    facts.top_comment_themes.length > 0 ||
    facts.upcoming_shows.length > 0 ||
    facts.top_audience_segments.length > 0 ||
    !!facts.media_sentiment_breakdown ||
    !!facts.latest_album;

  if (!hasAnyData) {
    await supabase
      .from("artist_insights")
      .upsert({ artist_id: artistId, insights: [], computed_at: new Date().toISOString() });
    return;
  }

  const response = await generateContentThrottled({
    model: "gemini-2.5-flash-lite",
    contents:
      `You're writing a short "what we've noticed" panel for a marketing dashboard about the ` +
      `artist "${artistName}", for a media team that already knows the basics — write like a sharp ` +
      "analyst flagging what's actually interesting, not a report summarizing every field. You're " +
      "given ONLY verified facts pulled from real data below — no outside knowledge, no assumptions " +
      "beyond what's written. Write 3-6 short insight cards. Every card's \"basis\" field must name " +
      "the exact number or fact from the data below it's drawn from. Do not invent numbers, trends, " +
      "causal links, or facts not present below — e.g. media_sentiment_breakdown is sentiment across " +
      "ALL recent coverage, not necessarily about latest_album specifically, unless recent_headlines " +
      "or top_comment_themes actually reference that album by name. If a category is null or empty, " +
      "skip it entirely rather than speculating or padding.\n\n" +
      "Style rules: avoid dry, templated filler like \"most coverage is about X\" or \"sentiment is " +
      "positive\" — instead lead with the real number: e.g. \"Coverage is running 68% positive, 9% " +
      "negative\" beats \"sentiment is good\", and \"comments about touring jumped from 12 to 40\" " +
      "beats \"there's more talk about touring\". When changes_since_last_check has a real delta, " +
      "frame it as a rise or fall over days_since_last_check (e.g. \"+340 subscribers over the past " +
      "3 days\") rather than restating the raw current_metrics number. Name the actual track, city, " +
      "theme, or segment rather than generalizing. Prefer punchy, specific, quantified language over " +
      "vague reassurance.\n\n" +
      `Data:\n${JSON.stringify(facts, null, 2)}`,
    config: { responseMimeType: "application/json", responseSchema: INSIGHTS_SCHEMA },
  });

  const parsed = JSON.parse(response.text ?? "{}");
  const insights: ArtistInsight[] = Array.isArray(parsed.insights)
    ? parsed.insights
        .slice(0, 6)
        .map((i: { headline?: unknown; detail?: unknown; basis?: unknown }) => ({
          headline: String(i.headline ?? "").slice(0, 80),
          detail: String(i.detail ?? "").slice(0, 240),
          basis: String(i.basis ?? "").slice(0, 160),
        }))
        .filter((i: ArtistInsight) => i.headline)
    : [];

  await supabase
    .from("artist_insights")
    .upsert({ artist_id: artistId, insights, computed_at: new Date().toISOString() });
}

export async function refreshInsightsIfStale(artistId: string, artistName: string) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("artist_insights")
    .select("computed_at")
    .eq("artist_id", artistId)
    .maybeSingle();

  const isStale =
    !data?.computed_at || Date.now() - new Date(data.computed_at).getTime() > STALE_AFTER_MS;
  if (!isStale) return;

  try {
    await refreshInsightsNow(artistId, artistName);
  } catch (err) {
    console.error(`refreshInsightsIfStale failed for artist ${artistId}:`, err);
  }
}
