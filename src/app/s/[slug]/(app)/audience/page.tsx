import { SitePlaceholderTab } from "@/components/site/SitePlaceholderTab";

export default async function AudiencePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <SitePlaceholderTab
      slug={slug}
      tabKey="audience"
      note="Venn diagram, Segment Explorer, Compare Segments, and Popular Statements — driven by a GWI (or similar) audience export uploaded in the builder. Upload + parsing lands in Phase 2."
    />
  );
}
