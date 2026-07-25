import { SiteBoardTab } from "@/components/site/SiteBoardTab";

export default async function StrategyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <SiteBoardTab
      slug={slug}
      tabKey="strategy"
      noun="strategy notes"
      subtitle="Positioning statements, campaign KPIs, and strategic pillars"
    />
  );
}
