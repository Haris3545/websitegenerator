import { getSiteArtist } from "@/lib/getSiteArtist";
import { resolveContent } from "@/lib/contentOverrides";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { BoardList } from "@/components/site/BoardList";
import { Editable } from "@/components/site/Editable";
import { SiteFooter } from "@/components/site/SiteFooter";
import { TABS } from "@/lib/tabs";
import type { TabKey } from "@/lib/database.types";

export async function SiteBoardTab({
  slug,
  tabKey,
  noun,
  subtitle,
}: {
  slug: string;
  tabKey: TabKey;
  noun: string;
  subtitle: string;
}) {
  const artist = await getSiteArtist(slug);
  const tab = TABS.find((t) => t.key === tabKey)!;
  const titleKey = `board.${tabKey}.title`;
  const contentKey = `board.${tabKey}.subtitle`;

  const supabase = createServiceRoleClient();
  const { data: items } = await supabase
    .from("board_items")
    .select("*")
    .eq("artist_id", artist.id)
    .eq("board_key", tabKey)
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
        <BoardList
          artistId={artist.id}
          boardKey={tabKey}
          noun={noun}
          initialItems={items ?? []}
        />
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
