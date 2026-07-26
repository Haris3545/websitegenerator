import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteArtist } from "@/lib/getSiteArtist";
import { refreshEventsForArtist, refreshEventsIfStale } from "@/lib/events";
import { MonthCalendar } from "@/components/site/MonthCalendar";
import { PendingIdeaStack } from "@/components/site/PendingIdeaStack";
import { TabHeading } from "@/components/site/TabHeading";
import { SiteFooter } from "@/components/site/SiteFooter";

export default async function CalendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const artist = await getSiteArtist(slug);

  const supabase = createServiceRoleClient();
  let { data: events } = await supabase
    .from("artist_events")
    .select("*")
    .eq("artist_id", artist.id)
    .gte("event_date", new Date().toISOString())
    .order("event_date", { ascending: true });

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

  const { data: tbcIdeas } = await supabase
    .from("board_items")
    .select("*")
    .eq("artist_id", artist.id)
    .eq("board_key", "ideas")
    .eq("calendar_status", "tbc")
    .order("created_at", { ascending: false });

  return (
    <div>
      <TabHeading
        artistId={artist.id}
        contentOverrides={artist.content_overrides}
        tabKey="calendar"
        title="Calendar"
        subtitle="Upcoming dates by month"
      />

      {!events?.length && (
        <p className="mt-4 text-sm text-white/50">
          No upcoming dates cached yet — hit &quot;Refresh Everything&quot; below, or add one yourself
          with &quot;+ Add event&quot;. If nothing shows up after refreshing, ask whoever manages this
          app to set TICKETMASTER_API_KEY for broader coverage.
        </p>
      )}
      <div className="mt-4">
        <MonthCalendar artistId={artist.id} slug={slug} events={events ?? []} />
      </div>

      {tbcIdeas && tbcIdeas.length > 0 && (
        <div className="mt-8">
          <PendingIdeaStack artistId={artist.id} slug={slug} items={tbcIdeas} />
        </div>
      )}

      <SiteFooter
        slug={slug}
        artistId={artist.id}
        tagline={artist.tagline}
        csvRows={events ?? []}
        csvFilename={`${slug}-calendar.csv`}
      />
    </div>
  );
}
