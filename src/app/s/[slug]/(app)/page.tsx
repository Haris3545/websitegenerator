import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteArtist } from "@/lib/getSiteArtist";
import { refreshSentimentNow, refreshSentimentIfStale } from "@/lib/sentiment";
import { refreshInsightsNow, refreshInsightsIfStale } from "@/lib/insights";
import { getRecentTrends, formatTrend } from "@/lib/trends";
import { refreshWikipediaTrendsNow, refreshWikipediaTrendsIfStale } from "@/lib/wikipedia";
import { resolveContent } from "@/lib/contentOverrides";
import { ArticleCard } from "@/components/site/ArticleCard";
import { InsightCard } from "@/components/site/InsightCard";
import { WikipediaTrendsSection } from "@/components/site/WikipediaTrends";
import { DashboardKpiGrid, type KpiEntry } from "@/components/site/DashboardKpiGrid";
import { Editable } from "@/components/site/Editable";
import { SiteFooter } from "@/components/site/SiteFooter";
import { TABS_BY_KEY, LIVE_TABS, orderedEnabledTabs } from "@/lib/tabs";
import type { TabKey } from "@/lib/database.types";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createServiceRoleClient();

  let artist = await getSiteArtist(slug);

  if (!artist.sentiment_summary?.computed_at) {
    // Nothing computed yet (a brand-new artist) — worth the wait so the
    // very first visit isn't just a wall of "no data yet" placeholders.
    try {
      await refreshSentimentNow(artist.id, artist.name);
      artist = await getSiteArtist(slug);
    } catch (err) {
      console.error(`Initial sentiment analysis failed for ${slug}:`, err);
    }
  } else {
    after(() => refreshSentimentIfStale(artist.id, artist.name));
  }

  let { data: insightsRow } = await supabase
    .from("artist_insights")
    .select("insights, computed_at")
    .eq("artist_id", artist.id)
    .maybeSingle();

  if (!insightsRow?.computed_at) {
    try {
      await refreshInsightsNow(artist.id, artist.name);
      ({ data: insightsRow } = await supabase
        .from("artist_insights")
        .select("insights, computed_at")
        .eq("artist_id", artist.id)
        .maybeSingle());
    } catch (err) {
      console.error(`Initial insights generation failed for ${slug}:`, err);
    }
  } else {
    after(() => refreshInsightsIfStale(artist.id, artist.name));
  }

  const [
    { count: mediaCount },
    { data: latestArticles },
    { count: eventsCount },
    { data: youtubeStats },
    { data: socialCommentMap },
    { data: musicStats },
    { count: audienceCount },
    { count: strategyCount },
    { count: tacticsCount },
    { count: ideasCount },
    { count: researchCount },
    trends,
  ] = await Promise.all([
    supabase.from("media_articles").select("id", { count: "exact", head: true }).eq("artist_id", artist.id),
    supabase
      .from("media_articles")
      .select("*")
      .eq("artist_id", artist.id)
      .order("published_at", { ascending: false })
      .limit(5),
    supabase
      .from("artist_events")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", artist.id)
      .gte("event_date", new Date().toISOString()),
    supabase.from("youtube_stats").select("*").eq("artist_id", artist.id).maybeSingle(),
    supabase.from("social_comment_map").select("comment_count").eq("artist_id", artist.id).maybeSingle(),
    supabase.from("music_stats").select("*").eq("artist_id", artist.id).maybeSingle(),
    supabase.from("audience_statements").select("id", { count: "exact", head: true }).eq("artist_id", artist.id),
    supabase
      .from("board_items")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", artist.id)
      .eq("board_key", "strategy"),
    supabase
      .from("board_items")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", artist.id)
      .eq("board_key", "tactics"),
    supabase
      .from("board_items")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", artist.id)
      .eq("board_key", "ideas"),
    supabase
      .from("board_items")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", artist.id)
      .eq("board_key", "research"),
    getRecentTrends(artist.id),
  ]);

  const albumNames = (musicStats?.top_albums ?? []).map((a) => a.name);
  let { data: wikipediaRow } = await supabase
    .from("wikipedia_trends")
    .select("articles, top_mover, computed_at")
    .eq("artist_id", artist.id)
    .maybeSingle();

  if (!wikipediaRow?.computed_at) {
    try {
      const trends = await refreshWikipediaTrendsNow(artist.id, artist.name, albumNames);
      wikipediaRow = { articles: trends.articles, top_mover: trends.topMover, computed_at: new Date().toISOString() };
    } catch (err) {
      console.error(`Initial Wikipedia trends fetch failed for ${slug}:`, err);
    }
  } else {
    after(() => refreshWikipediaTrendsIfStale(artist.id, artist.name, albumNames));
  }

  const wikipediaTrends = { articles: wikipediaRow?.articles ?? [], topMover: wikipediaRow?.top_mover ?? null };

  // Preserves whatever order a visitor last drag-reordered the tabs/cards
  // into (see NavPills / DashboardKpiGrid), rather than always falling
  // back to this file's fixed declaration order.
  const otherTabs = orderedEnabledTabs(artist.enabled_tabs)
    .filter((key) => key !== "dashboard")
    .map((key) => TABS_BY_KEY[key])
    .filter((tab): tab is (typeof TABS_BY_KEY)[TabKey] => !!tab);

  const { positive_pct = 0, negative_pct = 0, neutral_pct = 0 } = artist.sentiment_summary ?? {};
  const hasSentiment = positive_pct + negative_pct + neutral_pct > 0;
  const mediaCaption = hasSentiment
    ? `mentioning ${artist.name} · ${positive_pct}% positive, ${neutral_pct}% neutral, ${negative_pct}% negative`
    : `articles mentioning ${artist.name}`;

  const boardCount: Partial<Record<TabKey, number | null>> = {
    strategy: strategyCount,
    tactics: tacticsCount,
    ideas: ideasCount,
    research: researchCount,
  };

  function kpiFor(tabKey: TabKey) {
    switch (tabKey) {
      case "media":
        return { value: String(mediaCount ?? 0), caption: mediaCaption, trend: formatTrend(trends.media_count) };
      case "locations":
      case "calendar":
        return {
          value: String(eventsCount ?? 0),
          caption: eventsCount ? "upcoming dates" : "no dates yet",
          trend: formatTrend(trends.upcoming_events_count),
        };
      case "youtube":
        return {
          value: youtubeStats?.subscriber_count?.toLocaleString() ?? "—",
          caption: youtubeStats ? "subscribers" : "no channel linked yet",
          trend: formatTrend(trends.youtube_subscribers),
        };
      case "social_listening":
        return {
          value: String(socialCommentMap?.comment_count ?? 0),
          caption: socialCommentMap?.comment_count ? "comments categorized" : "no comments yet",
          trend: formatTrend(trends.social_comments_count),
        };
      case "music":
        return {
          value: musicStats?.listeners?.toLocaleString() ?? "—",
          caption: musicStats ? "Last.fm listeners" : "no data yet",
          trend: formatTrend(trends.music_listeners),
        };
      case "audience":
        return {
          value: String(audienceCount ?? 0),
          caption: audienceCount ? "statements imported" : "no research uploaded yet",
          trend: formatTrend(trends.audience_statements_count),
        };
      case "strategy":
      case "tactics":
      case "ideas":
      case "research": {
        const count = boardCount[tabKey] ?? 0;
        return { value: String(count), caption: count ? "cards" : "no cards yet", trend: null };
      }
      default:
        return null;
    }
  }

  const kpiEntries: KpiEntry[] = otherTabs.map((tab) => {
    const kpi = kpiFor(tab.key);
    return {
      tabKey: tab.key,
      label: tab.label,
      value: kpi?.value ?? "—",
      caption: kpi?.caption ?? (LIVE_TABS.includes(tab.key) ? "no data yet" : "live in a later phase"),
      trend: kpi?.trend ?? null,
      color: tab.key === "media" ? "var(--accent)" : "var(--primary)",
    };
  });

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <div className="h-4 w-1 bg-[var(--accent)]" />
        <h2 className="text-lg font-bold uppercase">Dashboard</h2>
        <Editable
          artistId={artist.id}
          contentKey="dashboard.subtitle"
          value={resolveContent(
            artist.content_overrides,
            "dashboard.subtitle",
            "Summary of current activity"
          )}
          as="span"
          className="text-sm text-white/40"
        />
      </div>

      <div className="mt-6">
        <DashboardKpiGrid
          key={otherTabs.map((t) => t.key).join(",")}
          artistId={artist.id}
          entries={kpiEntries}
        />
      </div>

      {!!insightsRow?.insights?.length && (
        <div className="mt-8">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-white/70">
            <span className="h-3 w-1 bg-[var(--accent)]" />
            What we&apos;ve noticed
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {insightsRow.insights.map((insight, i) => (
              <InsightCard key={i} insight={insight} />
            ))}
          </div>
        </div>
      )}

      {!!wikipediaTrends.articles.length && (
        <div className="mt-8">
          <WikipediaTrendsSection trends={wikipediaTrends} artistName={artist.name} />
        </div>
      )}

      {!!latestArticles?.length && (
        <div className="mt-8">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-white/70">
            <span className="h-3 w-1 bg-[var(--accent)]" />
            <Editable
              artistId={artist.id}
              contentKey="dashboard.coverage_heading"
              value={resolveContent(
                artist.content_overrides,
                "dashboard.coverage_heading",
                "Most relevant coverage"
              )}
              as="span"
            />
          </h3>
          <div className="flex flex-col gap-3">
            {latestArticles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </div>
      )}

      <SiteFooter
        slug={slug}
        artistId={artist.id}
        tagline={artist.tagline}
        csvRows={latestArticles ?? []}
        csvFilename={`${slug}-dashboard.csv`}
      />
    </div>
  );
}
