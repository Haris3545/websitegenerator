import { SitePlaceholderTab } from "@/components/site/SitePlaceholderTab";

export default async function SocialListeningPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <SitePlaceholderTab
      slug={slug}
      tabKey="social_listening"
      note="Overview, platform breakdown, topics, influencers, and a live feed — pulling from YouTube and Reddit once API keys are added in the builder."
    />
  );
}
