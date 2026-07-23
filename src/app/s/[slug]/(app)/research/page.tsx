import { SitePlaceholderTab } from "@/components/site/SitePlaceholderTab";

export default async function ResearchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <SitePlaceholderTab
      slug={slug}
      tabKey="research"
      note="Research Library with document uploads, plus a long-form written brief mixing prose, milestones, and stats — built in Phase 3."
    />
  );
}
