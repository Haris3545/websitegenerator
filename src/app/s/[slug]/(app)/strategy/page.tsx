import { SitePlaceholderTab } from "@/components/site/SitePlaceholderTab";

export default async function StrategyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <SitePlaceholderTab
      slug={slug}
      tabKey="strategy"
      note="Positioning statement, campaign KPIs, three strategic pillars with channel planning, and an LLM-generated Recommendations panel — built in Phase 3."
    />
  );
}
