import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteArtist } from "@/lib/getSiteArtist";
import { refreshSentimentIfStale } from "@/lib/sentiment";
import { MediaList } from "@/components/site/MediaList";
import { DashboardOverview } from "@/components/site/DashboardOverview";
import { SiteFooter } from "@/components/site/SiteFooter";

export default async function MediaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServiceRoleClient();

  const artist = await getSiteArtist(slug);

  after(() => refreshSentimentIfStale(artist.id, artist.name));

  const { data: articles } = await supabase
    .from("media_articles")
    .select("*")
    .eq("artist_id", artist.id)
    .order("published_at", { ascending: false });

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <div className="h-4 w-1 bg-[var(--accent)]" />
        <h2 className="text-lg font-bold uppercase">Media</h2>
        <span className="text-sm text-white/40">Chronological press coverage</span>
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
        <p className="mt-4 rounded-lg border border-dashed border-white/20 p-8 text-center text-white/50">
          No coverage cached yet — hit &quot;Refresh Everything&quot; below.
        </p>
      ) : (
        <MediaList articles={articles} />
      )}

      <SiteFooter
        slug={slug}
        tagline={artist.tagline}
        csvRows={articles ?? []}
        csvFilename={`${slug}-media.csv`}
      />
    </div>
  );
}
