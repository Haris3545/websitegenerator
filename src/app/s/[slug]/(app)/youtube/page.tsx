import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteArtist } from "@/lib/getSiteArtist";
import { refreshYoutubeStats, refreshYoutubeIfStale } from "@/lib/youtube";
import { getRecentTrends, formatTrend } from "@/lib/trends";
import { KpiCard } from "@/components/site/KpiCard";
import { SiteFooter } from "@/components/site/SiteFooter";

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

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <div className="h-4 w-1 bg-[var(--accent)]" />
        <h2 className="text-lg font-bold uppercase">YouTube</h2>
        <span className="text-sm text-white/40">
          {stats?.channel_title ?? `Channel stats for ${artist.name}`}
        </span>
      </div>

      {!artist.youtube_channel_id ? (
        <p className="mt-4 rounded-lg border border-dashed border-white/20 p-8 text-center text-white/50">
          No YouTube channel ID set for this artist yet — add one, plus a YouTube Data API key,
          in the builder.
        </p>
      ) : !stats ? (
        <p className="mt-4 rounded-lg border border-dashed border-white/20 p-8 text-center text-white/50">
          No stats cached yet — hit &quot;Refresh Everything&quot; below.
        </p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
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
