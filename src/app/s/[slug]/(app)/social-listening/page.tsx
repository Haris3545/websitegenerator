import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteArtist } from "@/lib/getSiteArtist";
import { refreshSocialListeningForArtist, refreshSocialListeningIfStale } from "@/lib/socialListening";
import { SiteFooter } from "@/components/site/SiteFooter";

const PLATFORM_LABEL: Record<string, string> = { reddit: "Reddit", youtube: "YouTube" };

export default async function SocialListeningPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artist = await getSiteArtist(slug);

  const supabase = createServiceRoleClient();
  let { data: mentions } = await supabase
    .from("social_mentions")
    .select("*")
    .eq("artist_id", artist.id)
    .order("published_at", { ascending: false })
    .limit(40);

  if (!mentions?.length) {
    try {
      await refreshSocialListeningForArtist(artist.id, artist.name);
      ({ data: mentions } = await supabase
        .from("social_mentions")
        .select("*")
        .eq("artist_id", artist.id)
        .order("published_at", { ascending: false })
        .limit(40));
    } catch (err) {
      console.error(`Initial social listening fetch failed for ${slug}:`, err);
    }
  } else {
    after(() => refreshSocialListeningIfStale(artist.id, artist.name));
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <div className="h-4 w-1 bg-[var(--accent)]" />
        <h2 className="text-lg font-bold uppercase">Social listening</h2>
        <span className="text-sm text-white/40">
          Reddit posts and YouTube videos mentioning {artist.name}
        </span>
      </div>

      {!mentions?.length ? (
        <p className="mt-4 rounded-lg border border-dashed border-white/20 p-8 text-center text-white/50">
          No mentions found yet — hit &quot;Refresh Everything&quot; below. YouTube mentions need
          YOUTUBE_API_KEY set; Reddit needs no setup at all.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {mentions.map((mention) => (
            <a
              key={mention.id}
              href={mention.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 shadow-lg shadow-black/30 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_0_28px_var(--accent)]"
              style={{
                borderRadius: "var(--card-radius, 12px)",
                backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
                border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
              }}
            >
              <div
                className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-60"
                style={{ color: "var(--card-text-color, #fff)" }}
              >
                <span>{PLATFORM_LABEL[mention.platform] ?? mention.platform}</span>
                {mention.author && <span>· {mention.author}</span>}
                {mention.score !== null && <span>· {mention.score} pts</span>}
              </div>
              <p className="mt-1 font-semibold" style={{ color: "var(--card-text-color, #fff)" }}>
                {mention.title}
              </p>
              {!!mention.excerpt && (
                <p
                  className="mt-1 text-sm opacity-70"
                  style={{ color: "var(--card-text-color, #fff)" }}
                >
                  {mention.excerpt}
                </p>
              )}
            </a>
          ))}
        </div>
      )}

      <SiteFooter
        slug={slug}
        artistId={artist.id}
        tagline={artist.tagline}
        csvRows={mentions ?? []}
        csvFilename={`${slug}-social-listening.csv`}
      />
    </div>
  );
}
