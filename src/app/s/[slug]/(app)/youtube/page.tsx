import { SitePlaceholderTab } from "@/components/site/SitePlaceholderTab";

export default async function YouTubePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <SitePlaceholderTab
      slug={slug}
      tabKey="youtube"
      note="Universe bubble chart, a live growth graph, and New/Viral trending videos with top comments — wired up in Phase 2 via the YouTube Data API."
    />
  );
}
