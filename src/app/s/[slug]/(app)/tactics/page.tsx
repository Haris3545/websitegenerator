import { SiteBoardTab } from "@/components/site/SiteBoardTab";

export default async function TacticsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <SiteBoardTab
      slug={slug}
      tabKey="tactics"
      noun="tactics"
      subtitle="Channel-level tactics with role, audience, format, notes, and team reactions"
    />
  );
}
