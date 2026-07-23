import { getSiteArtist } from "@/lib/getSiteArtist";
import { resolveContent } from "@/lib/contentOverrides";
import { EmptyBoardState } from "@/components/site/EmptyBoardState";
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
  const contentKey = `board.${tabKey}.subtitle`;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-1 bg-[var(--accent)]" />
            <h2 className="text-lg font-bold uppercase">{tab.label}</h2>
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
        <EmptyBoardState noun={noun} />
      </div>
      <SiteFooter slug={slug} tagline={artist.tagline} />
    </div>
  );
}
