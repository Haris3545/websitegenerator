import { getSiteArtist } from "@/lib/getSiteArtist";
import { PlaceholderSection } from "@/components/site/PlaceholderSection";
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

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <div className="h-4 w-1 bg-[var(--accent)]" />
        <h2 className="text-lg font-bold uppercase">{tab.label}</h2>
      </div>
      <div className="mt-6">
        <PlaceholderSection title={`${tab.label} — coming in a later phase`} note={note} />
      </div>
      <SiteFooter slug={slug} brandName={artist.name} tagline={artist.tagline} />
    </div>
  );
}
