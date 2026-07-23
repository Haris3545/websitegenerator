import { SiteBoardTab } from "@/components/site/SiteBoardTab";

export default async function IdeasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <SiteBoardTab
      slug={slug}
      tabKey="ideas"
      noun="ideas"
      subtitle="Visual mockups, supporting tactics, and team reactions per idea"
    />
  );
}
