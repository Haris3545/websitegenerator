import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteArtist } from "@/lib/getSiteArtist";
import { refreshSocialListeningForArtist, refreshSocialListeningIfStale } from "@/lib/socialListening";
import { CommentMap } from "@/components/site/CommentMap";
import { TabHeading } from "@/components/site/TabHeading";
import { SiteFooter } from "@/components/site/SiteFooter";

export default async function SocialListeningPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artist = await getSiteArtist(slug);

  const supabase = createServiceRoleClient();
  let { data: map } = await supabase
    .from("social_comment_map")
    .select("categories, comment_count, last_error, computed_at")
    .eq("artist_id", artist.id)
    .maybeSingle();

  if (!map?.computed_at) {
    try {
      await refreshSocialListeningForArtist(artist.id, artist.name);
      ({ data: map } = await supabase
        .from("social_comment_map")
        .select("categories, comment_count, last_error, computed_at")
        .eq("artist_id", artist.id)
        .maybeSingle());
    } catch (err) {
      console.error(`Initial social listening fetch failed for ${slug}:`, err);
    }
  } else {
    after(() => refreshSocialListeningIfStale(artist.id, artist.name));
  }

  const categories = map?.categories ?? [];
  const csvRows = categories.flatMap((c) =>
    c.subcategories.flatMap((s) =>
      s.comments.map((comment) => ({
        category: c.name,
        subcategory: s.name,
        platform: comment.platform,
        author: comment.author,
        text: comment.text,
        score: comment.score,
        context: comment.context,
        url: comment.url,
      }))
    )
  );

  return (
    <div>
      <TabHeading
        artistId={artist.id}
        contentOverrides={artist.content_overrides}
        tabKey="social_listening"
        title="Social listening"
        subtitle={`Reddit and YouTube comments about ${artist.name}, grouped by theme`}
      />

      {!categories.length ? (
        <div className="mt-4 rounded-lg border border-dashed border-white/20 p-8 text-center text-white/50">
          <p>
            No comments found yet — hit &quot;Refresh Everything&quot; below. YouTube comments need
            YOUTUBE_API_KEY set; Reddit needs no setup at all.
          </p>
          {map?.last_error && (
            <p className="mt-3 text-xs text-white/40">
              Last attempt: <span className="text-white/60">{map.last_error}</span>
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <CommentMap categories={categories} />
        </div>
      )}

      <SiteFooter
        slug={slug}
        artistId={artist.id}
        tagline={artist.tagline}
        csvRows={csvRows}
        csvFilename={`${slug}-social-listening.csv`}
      />
    </div>
  );
}
