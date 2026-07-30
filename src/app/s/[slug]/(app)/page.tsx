import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteArtist } from "@/lib/getSiteArtist";
import { refreshSentimentNow, refreshSentimentIfStale } from "@/lib/sentiment";
import { getRecentTrends, formatTrend } from "@/lib/trends";
import { refreshWikipediaTrendsNow, refreshWikipediaTrendsIfStale } from "@/lib/wikipedia";
import { resolveContent } from "@/lib/contentOverrides";
import { ArticleCard } from "@/components/site/ArticleCard";
import { WikipediaTrendsSection } from "@/components/site/WikipediaTrends";
import { CampaignTimeline } from "@/components/site/CampaignTimeline";
import { DashboardKpiGrid, type KpiEntry } from "@/components/site/DashboardKpiGrid";
import { DashboardSections, type DashboardSectionEntry } from "@/components/site/DashboardSections";
import { TabHeading } from "@/components/site/TabHeading";
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
    { data: campaignMilestones },
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
    supabase
      .from("campaign_milestones")
      .select("*")
      .eq("artist_id", artist.id)
      .order("milestone_date", { ascending: true }),
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
      color: "var(--primary)",
    };
  });

  const availableSections: Record<string, DashboardSectionEntry> = {};

  if (wikipediaTrends.articles.length) {
    availableSections.wikipedia = {
      key: "wikipedia",
      label: "Wikipedia pageviews",
      summary: wikipediaTrends.topMover
        ? `${wikipediaTrends.articles.length} articles tracked · top mover: ${wikipediaTrends.topMover.title}`
        : `${wikipediaTrends.articles.length} articles tracked`,
      content: (
        <div className="mt-8">
          <WikipediaTrendsSection trends={wikipediaTrends} artistName={artist.name} />
        </div>
      ),
    };
  }

  if (latestArticles?.length) {
    availableSections.coverage = {
      key: "coverage",
      label: "While you were gone",
      summary: `${latestArticles.length} article${latestArticles.length === 1 ? "" : "s"}`,
      content: (
        <div className="mt-8">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-white/70">
            <span className="h-3 w-1 bg-[var(--accent)]" />
            <Editable
              artistId={artist.id}
              contentKey="dashboard.coverage_heading"
              value={resolveContent(
                artist.content_overrides,
                "dashboard.coverage_heading",
                "While you were gone"
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
      ),
    };
  }

  // Preserves drag-reordering (see DashboardSections) while tolerating
  // sections that don't exist yet in an older artist's stored order, and
  // dropping any section whose underlying data isn't available right now.
  const storedOrder = artist.dashboard_section_order?.length
    ? artist.dashboard_section_order
    : ["wikipedia", "coverage"];
  const orderedSectionKeys = [
    ...storedOrder,
    ...Object.keys(availableSections).filter((k) => !storedOrder.includes(k)),
  ];
  const dashboardSections = orderedSectionKeys
    .map((key) => availableSections[key])
    .filter((s): s is DashboardSectionEntry => !!s);

  return (
    <div>
      <TabHeading
        artistId={artist.id}
        contentOverrides={artist.content_overrides}
        tabKey="dashboard"
        title="Dashboard"
        subtitle="Summary of current activity"
      />

      <div className="mt-6">
        <CampaignTimeline artistId={artist.id} milestones={campaignMilestones ?? []} />
      </div>

      <div className="mt-6">
        <DashboardKpiGrid
          key={otherTabs.map((t) => t.key).join(",")}
          artistId={artist.id}
          entries={kpiEntries}
        />
      </div>

      {!!dashboardSections.length && (
        <div className="mt-8">
          <DashboardSections
            key={dashboardSections.map((s) => s.key).join(",")}
            artistId={artist.id}
            sections={dashboardSections}
          />
        </div>
      )}

      <SiteFooter
        slug={slug}
        artistId={artist.id}
        artistName={artist.name}
        youtubeChannelId={artist.youtube_channel_id}
        tagline={artist.tagline}
        csvRows={latestArticles ?? []}
        csvFilename={`${slug}-dashboard.csv`}
      />
    </div>
  );
}
