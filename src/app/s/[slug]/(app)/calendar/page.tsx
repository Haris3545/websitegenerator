import { SitePlaceholderTab } from "@/components/site/SitePlaceholderTab";

export default async function CalendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <SitePlaceholderTab
      slug={slug}
      tabKey="calendar"
      note="Month Grid and Timeline views over Bandsintown tour dates and MusicBrainz release history, plus block-planned campaign events — built in Phase 3."
    />
  );
}
