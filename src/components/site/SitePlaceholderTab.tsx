import { getSiteArtist } from "@/lib/getSiteArtist";
import { resolveContent } from "@/lib/contentOverrides";
import { PlaceholderSection } from "@/components/site/PlaceholderSection";
import { Editable } from "@/components/site/Editable";
import { SiteFooter } from "@/components/site/SiteFooter";
import { TABS } from "@/lib/tabs";
import type { TabKey } from "@/lib/database.types";

export async function SitePlaceholderTab({
  slug,
  tabKey,
  note,
}: {
  slug: string;
  tabKey: TabKey;
  note: string;
}) {
  const artist = await getSiteArtist(slug);
  const tab = TABS.find((t) => t.key === tabKey)!;
  const contentKey = `placeholder.${tabKey}.note`;

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <div className="h-4 w-1 bg-[var(--accent)]" />
        <h2 className="text-lg font-bold uppercase">{tab.label}</h2>
      </div>
      <div className="mt-6">
        <PlaceholderSection
          title={`${tab.label} — coming in a later phase`}
          note={
            <Editable
              artistId={artist.id}
              contentKey={contentKey}
              value={resolveContent(artist.content_overrides, contentKey, note)}
              as="span"
            />
          }
        />
      </div>
      <SiteFooter slug={slug} tagline={artist.tagline} />
    </div>
  );
}
