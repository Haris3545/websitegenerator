import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteArtist } from "@/lib/getSiteArtist";
import { refreshSentimentNow, refreshSentimentIfStale } from "@/lib/sentiment";
import { refreshInsightsNow, refreshInsightsIfStale } from "@/lib/insights";
import { resolveContent } from "@/lib/contentOverrides";
import { KpiCard } from "@/components/site/KpiCard";
import { ArticleCard } from "@/components/site/ArticleCard";
import { InsightCard } from "@/components/site/InsightCard";
import { Editable } from "@/components/site/Editable";
import { SiteFooter } from "@/components/site/SiteFooter";
import { TABS, LIVE_TABS } from "@/lib/tabs";
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
  ]);

  const otherTabs = TABS.filter(
    (tab) => tab.key !== "dashboard" && artist.enabled_tabs.includes(tab.key)
  );

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
        return { value: String(mediaCount ?? 0), caption: mediaCaption };
      case "locations":
      case "calendar":
        return {
          value: String(eventsCount ?? 0),
          caption: eventsCount ? "upcoming dates" : "no dates yet",
        };
      case "youtube":
        return {
          value: youtubeStats?.subscriber_count?.toLocaleString() ?? "—",
          caption: youtubeStats ? "subscribers" : "no channel linked yet",
        };
      case "social_listening":
        return {
          value: String(socialCommentMap?.comment_count ?? 0),
          caption: socialCommentMap?.comment_count ? "comments categorized" : "no comments yet",
        };
      case "music":
        return {
          value: musicStats?.listeners?.toLocaleString() ?? "—",
          caption: musicStats ? "Last.fm listeners" : "no data yet",
        };
      case "audience":
        return {
          value: String(audienceCount ?? 0),
          caption: audienceCount ? "statements imported" : "no research uploaded yet",
        };
      case "strategy":
      case "tactics":
      case "ideas":
      case "research": {
        const count = boardCount[tabKey] ?? 0;
        return { value: String(count), caption: count ? "cards" : "no cards yet" };
      }
      default:
        return null;
    }
  }

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

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {otherTabs.map((tab) => {
          const kpi = kpiFor(tab.key);
          return (
            <KpiCard
              key={tab.key}
              label={tab.label}
              value={kpi?.value ?? "—"}
              caption={kpi?.caption ?? (LIVE_TABS.includes(tab.key) ? "no data yet" : "live in a later phase")}
              color={tab.key === "media" ? "var(--accent)" : "var(--primary)"}
            />
          );
        })}
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
