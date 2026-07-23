import { SitePlaceholderTab } from "@/components/site/SitePlaceholderTab";

export default async function MusicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <SitePlaceholderTab
      slug={slug}
      tabKey="music"
      note="Featured-content carousel, Spotify track list, kworb/Last.fm chart positions, market strength, and an artist/track network graph — wired up in Phase 2."
    />
  );
}
