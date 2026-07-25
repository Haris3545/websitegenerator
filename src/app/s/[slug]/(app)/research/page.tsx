import { SiteBoardTab } from "@/components/site/SiteBoardTab";

export default async function ResearchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <SiteBoardTab
      slug={slug}
      tabKey="research"
      noun="research notes"
      subtitle="Findings, sources, and supporting stats"
    />
  );
}
