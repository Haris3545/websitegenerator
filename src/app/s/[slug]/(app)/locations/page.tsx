import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteArtist } from "@/lib/getSiteArtist";
import { refreshEventsForArtist, refreshEventsIfStale } from "@/lib/events";
import { EventList } from "@/components/site/EventList";
import { TourGlobe, type TourGlobePoint } from "@/components/site/TourGlobe";
import { SiteFooter } from "@/components/site/SiteFooter";

export default async function LocationsPage({ params }: { params: Promise<{ slug: string }> }) {
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

  const globePoints: TourGlobePoint[] = (events ?? [])
    .filter((e) => typeof e.latitude === "number" && typeof e.longitude === "number")
    .map((e) => ({
      lat: e.latitude as number,
      lng: e.longitude as number,
      label: `${e.venue} — ${[e.city, e.country].filter(Boolean).join(", ")}`,
    }));

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <div className="h-4 w-1 bg-[var(--accent)]" />
        <h2 className="text-lg font-bold uppercase">Locations</h2>
        <span className="text-sm text-white/40">Upcoming tour dates by city</span>
      </div>

      {!events?.length ? (
        <p className="mt-4 rounded-lg border border-dashed border-white/20 p-8 text-center text-white/50">
          No upcoming tour dates cached yet — hit &quot;Refresh Everything&quot; below. If nothing
          shows up after that, ask whoever manages this app to set TICKETMASTER_API_KEY for
          broader coverage.
        </p>
      ) : (
        <>
          {globePoints.length ? (
            <div className="mt-4">
              <TourGlobe points={globePoints} />
            </div>
          ) : (
            <p className="mt-4 text-xs text-white/30">
              Globe view needs location data for at least one date — this fills in as tour dates
              are found.
            </p>
          )}
          <div className="mt-6">
            <EventList events={events} groupBy="city" />
          </div>
        </>
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
