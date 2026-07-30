import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteArtist } from "@/lib/getSiteArtist";
import { refreshMediaForArtist } from "@/lib/media";
import { refreshSentimentNow, refreshSentimentIfStale } from "@/lib/sentiment";
import { refreshInsightsNow, refreshInsightsIfStale } from "@/lib/insights";
import { resolveContent } from "@/lib/contentOverrides";
import { MediaList } from "@/components/site/MediaList";
import { DashboardOverview } from "@/components/site/DashboardOverview";
import { InsightCard } from "@/components/site/InsightCard";
import { TabHeading } from "@/components/site/TabHeading";
import { Editable } from "@/components/site/Editable";
import { SiteFooter } from "@/components/site/SiteFooter";

export default async function MediaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServiceRoleClient();

  let artist = await getSiteArtist(slug);

  if (!artist.sentiment_summary?.computed_at) {
    try {
      await refreshSentimentNow(artist.id, artist.name);
      artist = await getSiteArtist(slug);
    } catch (err) {
      console.error(`Initial sentiment analysis failed for ${slug}:`, err);
    }
  } else {
    after(() => refreshSentimentIfStale(artist.id, artist.name));
  }

  let { data: articles } = await supabase
    .from("media_articles")
    .select("*")
    .eq("artist_id", artist.id)
    .order("published_at", { ascending: false });

  if (!articles?.length) {
    try {
      await refreshMediaForArtist(artist.id, artist.name);
      ({ data: articles } = await supabase
        .from("media_articles")
        .select("*")
        .eq("artist_id", artist.id)
        .order("published_at", { ascending: false }));
    } catch (err) {
      console.error(`Initial media fetch failed for ${slug}:`, err);
    }
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

  const insights = insightsRow?.insights ?? [];

  return (
    <div>
      <TabHeading
        artistId={artist.id}
        contentOverrides={artist.content_overrides}
        tabKey="media"
        title="Media"
        subtitle="Chronological press coverage"
      />

      <div className="mt-4">
        <DashboardOverview
          artistId={artist.id}
          summary={artist.sentiment_summary ?? {}}
          articles={articles ?? []}
        />
      </div>

      {insights.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-white/70">
            <span className="h-3 w-1 bg-[var(--accent)]" />
            What we&apos;ve noticed
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {insights.map((insight, i) => (
              <InsightCard key={i} insight={insight} />
            ))}
          </div>
        </div>
      )}

      <p className="mt-8 text-sm text-white/50">
        {articles?.length ?? 0} results · sourced from Google News
      </p>

      {!articles?.length ? (
        <div className="mt-4 rounded-lg border border-dashed border-white/20 p-8 text-center text-white/50">
          <Editable
            artistId={artist.id}
            contentKey="media.empty_state"
            value={resolveContent(
              artist.content_overrides,
              "media.empty_state",
              'No coverage cached yet — hit "Refresh Everything" below.'
            )}
            as="p"
          />
        </div>
      ) : (
        <MediaList articles={articles} />
      )}

      <SiteFooter
        slug={slug}
        artistId={artist.id}
        artistName={artist.name}
        youtubeChannelId={artist.youtube_channel_id}
        tagline={artist.tagline}
        csvRows={articles ?? []}
        csvFilename={`${slug}-media.csv`}
      />
    </div>
  );
}
