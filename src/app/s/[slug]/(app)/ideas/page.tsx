import { getSiteArtist } from "@/lib/getSiteArtist";
import { resolveContent } from "@/lib/contentOverrides";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { IdeasBoard } from "@/components/site/ideas/IdeasBoard";
import { Editable } from "@/components/site/Editable";
import { SiteFooter } from "@/components/site/SiteFooter";
import { TABS } from "@/lib/tabs";

export default async function IdeasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const artist = await getSiteArtist(slug);
  const tab = TABS.find((t) => t.key === "ideas")!;
  const titleKey = "board.ideas.title";
  const contentKey = "board.ideas.subtitle";
  const subtitle = "Swipe through visual mockups — right to like, left to pass";

  const supabase = createServiceRoleClient();
  const { data: items } = await supabase
    .from("board_items")
    .select("*")
    .eq("artist_id", artist.id)
    .eq("board_key", "ideas")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-1 bg-[var(--accent)]" />
            <Editable
              artistId={artist.id}
              contentKey={titleKey}
              value={resolveContent(artist.content_overrides, titleKey, tab.label)}
              as="h2"
              className="text-lg font-bold uppercase"
            />
          </div>
          <Editable
            artistId={artist.id}
            contentKey={contentKey}
            value={resolveContent(artist.content_overrides, contentKey, subtitle)}
            as="p"
            className="mt-1 text-sm text-white/40"
          />
        </div>
      </div>
      <div className="mt-6">
        <IdeasBoard artistId={artist.id} slug={slug} initialItems={items ?? []} />
      </div>
      <SiteFooter
        slug={slug}
        artistId={artist.id}
        artistName={artist.name}
        youtubeChannelId={artist.youtube_channel_id}
        tagline={artist.tagline}
      />
    </div>
  );
}
