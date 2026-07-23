import { SitePlaceholderTab } from "@/components/site/SitePlaceholderTab";

export default async function LocationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <SitePlaceholderTab
      slug={slug}
      tabKey="locations"
      note="Layer checklist with live pin counts over an interactive map, plus a stats strip — built in Phase 3."
    />
  );
}
