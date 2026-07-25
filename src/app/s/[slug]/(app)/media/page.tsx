import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteArtist } from "@/lib/getSiteArtist";
import { refreshMediaForArtist } from "@/lib/media";
import { refreshSentimentNow, refreshSentimentIfStale } from "@/lib/sentiment";
import { resolveContent } from "@/lib/contentOverrides";
import { MediaList } from "@/components/site/MediaList";
import { DashboardOverview } from "@/components/site/DashboardOverview";
import { Editable } from "@/components/site/Editable";
import { SiteFooter } from "@/components/site/SiteFooter";

export default async function MediaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServiceRoleClient();

  let artist = await getSiteArtist(slug);

  if (!artist.sentiment_summary?.computed_at) {
    try {
      await refreshSentimentNow(artist.id, artist.name);
      artist = await getSiteArtist(slug);
    } catch (err) {
      console.error(`Initial sentiment analysis failed for ${slug}:`, err);
    }
  } else {
    after(() => refreshSentimentIfStale(artist.id, artist.name));
  }

  let { data: articles } = await supabase
    .from("media_articles")
    .select("*")
    .eq("artist_id", artist.id)
    .order("published_at", { ascending: false });

  if (!articles?.length) {
    try {
      await refreshMediaForArtist(artist.id, artist.name);
      ({ data: articles } = await supabase
        .from("media_articles")
        .select("*")
        .eq("artist_id", artist.id)
        .order("published_at", { ascending: false }));
    } catch (err) {
      console.error(`Initial media fetch failed for ${slug}:`, err);
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <div className="h-4 w-1 bg-[var(--accent)]" />
        <h2 className="text-lg font-bold uppercase">Media</h2>
        <Editable
          artistId={artist.id}
          contentKey="media.subtitle"
          value={resolveContent(
            artist.content_overrides,
            "media.subtitle",
            "Chronological press coverage"
          )}
          as="span"
          className="text-sm text-white/40"
        />
      </div>

      <div className="mt-4">
        <DashboardOverview
          artistId={artist.id}
          summary={artist.sentiment_summary ?? {}}
          articles={articles ?? []}
        />
      </div>

      <p className="text-sm text-white/50">
        {articles?.length ?? 0} results · sourced from Google News
      </p>

      {!articles?.length ? (
        <div className="mt-4 rounded-lg border border-dashed border-white/20 p-8 text-center text-white/50">
          <Editable
            artistId={artist.id}
            contentKey="media.empty_state"
            value={resolveContent(
              artist.content_overrides,
              "media.empty_state",
              'No coverage cached yet — hit "Refresh Everything" below.'
            )}
            as="p"
          />
        </div>
      ) : (
        <MediaList articles={articles} />
      )}

      <SiteFooter
        slug={slug}
        artistId={artist.id}
        tagline={artist.tagline}
        csvRows={articles ?? []}
        csvFilename={`${slug}-media.csv`}
      />
    </div>
  );
}
