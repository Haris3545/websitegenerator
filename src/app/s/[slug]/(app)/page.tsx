import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { KpiCard } from "@/components/site/KpiCard";
import { ArticleCard } from "@/components/site/ArticleCard";
import { SiteFooter } from "@/components/site/SiteFooter";
import { TABS, LIVE_TABS } from "@/lib/tabs";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createServiceRoleClient();

  const { data: artist } = await supabase.from("artists").select("*").eq("slug", slug).single();
  if (!artist) notFound();

  const { count: mediaCount } = await supabase
    .from("media_articles")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", artist.id);

  const { data: latestArticles } = await supabase
    .from("media_articles")
    .select("*")
    .eq("artist_id", artist.id)
    .order("published_at", { ascending: false })
    .limit(5);

  const otherTabs = TABS.filter(
    (tab) => tab.key !== "dashboard" && artist.enabled_tabs.includes(tab.key)
  );

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <div className="h-4 w-1 bg-[var(--accent)]" />
        <h2 className="text-lg font-bold uppercase">Dashboard</h2>
        <span className="text-sm text-white/40">Summary of current activity</span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {otherTabs.map((tab) =>
          tab.key === "media" ? (
            <KpiCard
              key={tab.key}
              label={`${artist.name} in Media`}
              value={String(mediaCount ?? 0)}
              caption="articles mentioning the artist"
              color="var(--accent)"
            />
          ) : (
            <KpiCard
              key={tab.key}
              label={tab.label}
              value="—"
              caption={
                LIVE_TABS.includes(tab.key) ? "no data yet" : "live in a later phase"
              }
              color="var(--primary)"
            />
          )
        )}
      </div>

      {!!latestArticles?.length && (
        <div className="mt-8">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-white/70">
            <span className="h-3 w-1 bg-[var(--accent)]" />
            Most relevant coverage
          </h3>
          <div className="flex flex-col gap-3">
            {latestArticles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </div>
      )}

      <SiteFooter
        slug={slug}
        tagline={artist.tagline}
        csvRows={latestArticles ?? []}
        csvFilename={`${slug}-dashboard.csv`}
      />
    </div>
  );
}
