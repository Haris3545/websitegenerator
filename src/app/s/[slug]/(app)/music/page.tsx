import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteArtist } from "@/lib/getSiteArtist";
import { refreshMusicIfStale } from "@/lib/music";
import { KpiCard } from "@/components/site/KpiCard";
import { SiteFooter } from "@/components/site/SiteFooter";

export default async function MusicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const artist = await getSiteArtist(slug);

  after(() => refreshMusicIfStale(artist.id, artist.name));

  const supabase = createServiceRoleClient();
  const { data: stats } = await supabase
    .from("music_stats")
    .select("*")
    .eq("artist_id", artist.id)
    .maybeSingle();

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <div className="h-4 w-1 bg-[var(--accent)]" />
        <h2 className="text-lg font-bold uppercase">Music</h2>
        <span className="text-sm text-white/40">Last.fm listener stats for {artist.name}</span>
      </div>

      {!stats ? (
        <p className="mt-4 rounded-lg border border-dashed border-white/20 p-8 text-center text-white/50">
          No stats cached yet — add a Last.fm API key under this artist&apos;s API keys in the
          builder, then hit &quot;Refresh Everything&quot; below.
        </p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <KpiCard
              label="Listeners"
              value={stats.listeners?.toLocaleString() ?? "—"}
              caption="unique Last.fm listeners"
              color="var(--accent)"
            />
            <KpiCard
              label="Scrobbles"
              value={stats.playcount?.toLocaleString() ?? "—"}
              caption="total plays tracked by Last.fm"
              color="var(--primary)"
            />
          </div>

          {!!stats.top_tags.length && (
            <div className="mt-8 flex flex-wrap gap-2">
              {stats.top_tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {!!stats.top_tracks.length && (
            <div className="mt-8">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-white/70">
                <span className="h-3 w-1 bg-[var(--accent)]" />
                Top tracks
              </h3>
              <div className="flex flex-col gap-2">
                {stats.top_tracks.map((track, i) => (
                  <a
                    key={track.url || track.name}
                    href={track.url || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 shadow-lg shadow-black/30 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_0_28px_var(--accent)]"
                    style={{
                      borderRadius: "var(--card-radius, 12px)",
                      backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
                      border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
                    }}
                  >
                    <span
                      className="flex items-center gap-3 text-sm font-medium"
                      style={{ color: "var(--card-text-color, #fff)" }}
                    >
                      <span className="opacity-40">{i + 1}</span>
                      {track.name}
                    </span>
                    {track.playcount !== null && (
                      <span className="text-xs opacity-60" style={{ color: "var(--card-text-color, #fff)" }}>
                        {track.playcount.toLocaleString()} plays
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <SiteFooter
        slug={slug}
        tagline={artist.tagline}
        csvRows={stats?.top_tracks ?? []}
        csvFilename={`${slug}-music.csv`}
      />
    </div>
  );
}
