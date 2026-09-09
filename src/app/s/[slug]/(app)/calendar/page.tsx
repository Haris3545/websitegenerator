import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteArtist } from "@/lib/getSiteArtist";
import { refreshEventsForArtist, refreshEventsIfStale } from "@/lib/events";
import { CalendarBoard } from "@/components/site/CalendarBoard";
import { CampaignGanttBoard } from "@/components/site/CampaignGanttBoard";
import { CollapsibleSection } from "@/components/site/CollapsibleSection";
import { TabHeading } from "@/components/site/TabHeading";
import { SiteFooter } from "@/components/site/SiteFooter";

export default async function CalendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const artist = await getSiteArtist(slug);

  const supabase = createServiceRoleClient();
  // Three independent reads (tbcIdeas/campaignBlocks don't depend on
  // events at all) — fetch together, then only events' own conditional
  // refresh-and-reread below needs a second round trip.
  const [eventsResult, { data: tbcIdeas }, { data: campaignBlocks }] = await Promise.all([
    supabase
      .from("artist_events")
      .select("*")
      .eq("artist_id", artist.id)
      .gte("event_date", new Date().toISOString())
      .order("event_date", { ascending: true }),
    supabase
      .from("board_items")
      .select("*")
      .eq("artist_id", artist.id)
      .eq("board_key", "ideas")
      .eq("calendar_status", "tbc")
      .order("created_at", { ascending: false }),
    supabase
      .from("board_items")
      .select("*")
      .eq("artist_id", artist.id)
      .eq("board_key", "tactics")
      .is("deleted_at", null)
      .not("pillar", "is", null)
      .not("campaign_start_date", "is", null)
      .not("campaign_end_date", "is", null),
  ]);
  let { data: events } = eventsResult;

  if (!events?.length) {
    try {
      await refreshEventsForArtist(artist.id, artist.name);
      ({ data: events } = await supabase
        .from("artist_events")
        .select("*")
        .eq("artist_id", artist.id)
        .gte("event_date", new Date().toISOString())
        .order("event_date", { ascending: true }));
    } catch (err) {
      console.error(`Initial events fetch failed for ${slug}:`, err);
    }
  } else {
    after(() => refreshEventsIfStale(artist.id, artist.name));
  }

  return (
    <div>
      <TabHeading
        artistId={artist.id}
        contentOverrides={artist.content_overrides}
        tabKey="calendar"
        title="Calendar"
        subtitle="Upcoming dates by month"
      />

      <div className="mt-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-white/70">
          <span className="h-3 w-1 bg-[var(--accent)]" />
          Campaign timeline
        </h3>
        <CampaignGanttBoard artistId={artist.id} initialBlocks={campaignBlocks ?? []} />
      </div>

      <CollapsibleSection title="Month view">
        {!events?.length && (
          <p className="mb-4 text-sm text-white/50">No upcoming dates.</p>
        )}
        <CalendarBoard
          artistId={artist.id}
          slug={slug}
          initialEvents={events ?? []}
          initialTbcIdeas={tbcIdeas ?? []}
        />
      </CollapsibleSection>

      <SiteFooter
        slug={slug}
        artistId={artist.id}
        artistName={artist.name}
        youtubeChannelId={artist.youtube_channel_id}
        tagline={artist.tagline}
        csvRows={events ?? []}
        csvFilename={`${slug}-calendar.csv`}
      />
    </div>
  );
}
