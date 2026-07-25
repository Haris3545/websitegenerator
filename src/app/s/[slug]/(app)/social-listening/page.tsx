import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteArtist } from "@/lib/getSiteArtist";
import { refreshSocialListeningForArtist, refreshSocialListeningIfStale } from "@/lib/socialListening";
import { CommentMap } from "@/components/site/CommentMap";
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
    .select("categories, comment_count, computed_at")
    .eq("artist_id", artist.id)
    .maybeSingle();

  if (!map?.computed_at) {
    try {
      await refreshSocialListeningForArtist(artist.id, artist.name);
      ({ data: map } = await supabase
        .from("social_comment_map")
        .select("categories, comment_count, computed_at")
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
      <div className="mb-1 flex items-center gap-2">
        <div className="h-4 w-1 bg-[var(--accent)]" />
        <h2 className="text-lg font-bold uppercase">Social listening</h2>
        <span className="text-sm text-white/40">
          Reddit and YouTube comments about {artist.name}, grouped by theme
        </span>
      </div>

      {!categories.length ? (
        <p className="mt-4 rounded-lg border border-dashed border-white/20 p-8 text-center text-white/50">
          No comments found yet — hit &quot;Refresh Everything&quot; below. YouTube comments need
          YOUTUBE_API_KEY set; Reddit needs no setup at all.
        </p>
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
