import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteArtist } from "@/lib/getSiteArtist";
import { refreshEventsIfStale } from "@/lib/events";
import { EventList } from "@/components/site/EventList";
import { SiteFooter } from "@/components/site/SiteFooter";

export default async function LocationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const artist = await getSiteArtist(slug);

  after(() => refreshEventsIfStale(artist.id, artist.name));

  const supabase = createServiceRoleClient();
  const { data: events } = await supabase
    .from("artist_events")
    .select("*")
    .eq("artist_id", artist.id)
    .gte("event_date", new Date().toISOString())
    .order("event_date", { ascending: true });

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <div className="h-4 w-1 bg-[var(--accent)]" />
        <h2 className="text-lg font-bold uppercase">Locations</h2>
        <span className="text-sm text-white/40">Upcoming tour dates by city</span>
      </div>

      {!events?.length ? (
        <p className="mt-4 rounded-lg border border-dashed border-white/20 p-8 text-center text-white/50">
          No upcoming tour dates cached yet — add a Bandsintown app_id under this artist&apos;s
          API keys in the builder, then hit &quot;Refresh Everything&quot; below.
        </p>
      ) : (
        <div className="mt-4">
          <EventList events={events} groupBy="city" />
        </div>
      )}

      <SiteFooter
        slug={slug}
        artistId={artist.id}
        tagline={artist.tagline}
        csvRows={events ?? []}
        csvFilename={`${slug}-locations.csv`}
      />
    </div>
  );
}
