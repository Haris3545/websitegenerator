import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteArtist } from "@/lib/getSiteArtist";
import { refreshYoutubeStats, refreshYoutubeIfStale } from "@/lib/youtube";
import { refreshSocialListeningForArtist, refreshSocialListeningIfStale } from "@/lib/socialListening";
import { getRecentTrends, formatTrend } from "@/lib/trends";
import { KpiCard } from "@/components/site/KpiCard";
import { CommentMap } from "@/components/site/CommentMap";
import { YoutubeSections } from "@/components/site/YoutubeSections";
import type { SectionEntry } from "@/components/site/ReorderableSections";
import { TabHeading } from "@/components/site/TabHeading";
import { SiteFooter } from "@/components/site/SiteFooter";
import { BrandedEmptyState } from "@/components/BrandedEmptyState";

export default async function YoutubePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const artist = await getSiteArtist(slug);

  const supabase = createServiceRoleClient();
  let { data: stats } = await supabase
    .from("youtube_stats")
    .select("*")
    .eq("artist_id", artist.id)
    .maybeSingle();

  if (!stats && artist.youtube_channel_id) {
    try {
      await refreshYoutubeStats(artist.id, artist.youtube_channel_id);
      ({ data: stats } = await supabase
        .from("youtube_stats")
        .select("*")
        .eq("artist_id", artist.id)
        .maybeSingle());
    } catch (err) {
      console.error(`Initial YouTube fetch failed for ${slug}:`, err);
    }
  } else if (artist.youtube_channel_id) {
    after(() => refreshYoutubeIfStale(artist.id, artist.youtube_channel_id));
  }

  const videos = stats?.recent_videos ?? [];
  const trends = stats ? await getRecentTrends(artist.id) : {};

  let { data: map, error: mapError } = await supabase
    .from("social_comment_map")
    .select("categories, comment_count, last_error, computed_at")
    .eq("artist_id", artist.id)
    .maybeSingle();

  if (!map?.computed_at && !mapError) {
    try {
      await refreshSocialListeningForArtist(artist.id, artist.name);
      ({ data: map, error: mapError } = await supabase
        .from("social_comment_map")
        .select("categories, comment_count, last_error, computed_at")
        .eq("artist_id", artist.id)
        .maybeSingle());
    } catch (err) {
      console.error(`Initial comment map fetch failed for ${slug}:`, err);
    }
  } else if (!mapError) {
    after(() => refreshSocialListeningIfStale(artist.id, artist.name));
  }

  const commentCategories = map?.categories ?? [];

  const sections: Record<string, SectionEntry> = {
    comments: {
      key: "comments",
      label: "Comment themes",
      summary: map?.computed_at ? `${map.comment_count ?? 0} comments categorized` : "Not refreshed yet",
      content: (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-white/70">
            <span className="h-3 w-1 bg-[var(--accent)]" />
            Comment themes
          </h3>
          {map?.computed_at && (
            <p className="mb-2 text-xs text-white/30">
              {map.comment_count ?? 0} comment{map.comment_count === 1 ? "" : "s"} · last checked{" "}
              {new Date(map.computed_at).toLocaleString()}
              {map.last_error && <span className="text-white/50"> · {map.last_error}</span>}
            </p>
          )}
          {mapError ? (
            <div className="rounded-lg border border-dashed border-red-400/40 p-8 text-center text-red-300/80">
              <p>
                Database error reading social_comment_map — this table is probably missing a column a
                migration adds. Run{" "}
                <code className="text-red-200">migrations/020_social_comment_map_last_error.sql</code> in
                Supabase, then refresh this page.
              </p>
              <p className="mt-3 text-xs text-red-300/60">{mapError.message}</p>
            </div>
          ) : !commentCategories.length ? (
            <BrandedEmptyState message={`No comments found yet — hit "Refresh Everything" below. Needs YOUTUBE_API_KEY set.`} />
          ) : (
            <CommentMap categories={commentCategories} />
          )}
        </div>
      ),
    },
    stats: {
      key: "stats",
      label: "Channel stats",
      summary: stats
        ? `${stats.subscriber_count?.toLocaleString() ?? "—"} subscribers · ${videos.length} recent videos`
        : "Not linked yet",
      content: (
        <div>
          {!artist.youtube_channel_id ? (
            <BrandedEmptyState message="No YouTube channel ID set for this artist yet — add one, plus a YouTube Data API key, in the builder." />
          ) : !stats ? (
            <BrandedEmptyState message={`No stats cached yet — hit "Refresh Everything" below.`} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <KpiCard
                  label="Subscribers"
                  value={stats.subscriber_count?.toLocaleString() ?? "—"}
                  caption={stats.channel_title ?? artist.name}
                  trend={formatTrend(trends.youtube_subscribers)}
                  color="var(--accent)"
                />
                <KpiCard
                  label="Total views"
                  value={stats.view_count?.toLocaleString() ?? "—"}
                  caption="lifetime channel views"
                  trend={formatTrend(trends.youtube_views)}
                  color="var(--primary)"
                />
                <KpiCard
                  label="Videos"
                  value={stats.video_count?.toLocaleString() ?? "—"}
                  caption="published on channel"
                  color="var(--primary)"
                />
              </div>

              {!!videos.length && (
                <div className="mt-8">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-white/70">
                    <span className="h-3 w-1 bg-[var(--accent)]" />
                    Recent videos
                  </h3>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                    {videos.map((video) => (
                      <a
                        key={video.id}
                        href={`https://youtube.com/watch?v=${video.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group overflow-hidden shadow-lg shadow-black/30 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_0_28px_var(--accent)]"
                        style={{
                          borderRadius: "var(--card-radius, 12px)",
                          backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
                          border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
                        }}
                      >
                        {video.thumbnail && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={video.thumbnail}
                            alt={video.title}
                            className="aspect-video w-full object-cover"
                          />
                        )}
                        <p
                          className="p-2 text-xs font-medium leading-snug"
                          style={{ color: "var(--card-text-color, #fff)" }}
                        >
                          {video.title}
                        </p>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ),
    },
  };

  const storedOrder = artist.youtube_section_order?.length ? artist.youtube_section_order : ["comments", "stats"];
  const orderedKeys = [...storedOrder, ...Object.keys(sections).filter((k) => !storedOrder.includes(k))];
  const orderedSections = orderedKeys.map((key) => sections[key]).filter((s): s is SectionEntry => !!s);

  return (
    <div>
      <TabHeading
        artistId={artist.id}
        contentOverrides={artist.content_overrides}
        tabKey="youtube"
        title="YouTube"
        subtitle={stats?.channel_title ?? `Channel stats for ${artist.name}`}
      />

      <div className="mt-6">
        <YoutubeSections
          key={orderedSections.map((s) => s.key).join(",")}
          artistId={artist.id}
          sections={orderedSections}
        />
      </div>

      <SiteFooter
        slug={slug}
        artistId={artist.id}
        tagline={artist.tagline}
        csvRows={videos}
        csvFilename={`${slug}-youtube.csv`}
      />
    </div>
  );
}
