import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ArticleCard } from "@/components/site/ArticleCard";
import { SiteFooter } from "@/components/site/SiteFooter";

export default async function MediaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: artist } = await supabase.from("artists").select("*").eq("slug", slug).single();
  if (!artist) notFound();

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

      <p className="mt-4 text-sm text-white/50">
        {articles?.length ?? 0} results · sourced from Google News
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {!articles?.length && (
          <p className="rounded-lg border border-dashed border-white/20 p-8 text-center text-white/50">
            No coverage cached yet — hit &quot;Refresh Everything&quot; below.
          </p>
        )}
        {articles?.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>

      <SiteFooter
        slug={slug}
        brandName={artist.name}
        tagline={artist.tagline}
        csvRows={articles ?? []}
        csvFilename={`${slug}-media.csv`}
      />
    </div>
  );
}
