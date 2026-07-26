import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteArtist } from "@/lib/getSiteArtist";
import { refreshConversationThemesForArtist, refreshConversationThemesIfStale } from "@/lib/conversationThemes";
import { ConversationThemes } from "@/components/site/ConversationThemes";
import { WordCloud } from "@/components/site/WordCloud";
import { TabHeading } from "@/components/site/TabHeading";
import { SiteFooter } from "@/components/site/SiteFooter";
import { BrandedEmptyState } from "@/components/BrandedEmptyState";

export default async function SocialListeningPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artist = await getSiteArtist(slug);

  const supabase = createServiceRoleClient();
  let { data: row, error: rowError } = await supabase
    .from("conversation_themes")
    .select("themes, word_cloud, computed_at")
    .eq("artist_id", artist.id)
    .maybeSingle();

  if (!row?.computed_at && !rowError) {
    try {
      await refreshConversationThemesForArtist(artist.id, artist.name);
      ({ data: row, error: rowError } = await supabase
        .from("conversation_themes")
        .select("themes, word_cloud, computed_at")
        .eq("artist_id", artist.id)
        .maybeSingle());
    } catch (err) {
      console.error(`Initial conversation themes fetch failed for ${slug}:`, err);
    }
  } else if (!rowError) {
    after(() => refreshConversationThemesIfStale(artist.id, artist.name));
  }

  const themes = row?.themes ?? [];
  const wordCloud = row?.word_cloud ?? [];
  const totalMentions = themes.reduce((sum, t) => sum + t.count, 0);
  const csvRows = themes.map((t) => ({
    theme: t.name,
    pct: totalMentions ? Math.round((t.count / totalMentions) * 1000) / 10 : 0,
    examples: t.examples.join(" | "),
  }));

  return (
    <div>
      <TabHeading
        artistId={artist.id}
        contentOverrides={artist.content_overrides}
        tabKey="social_listening"
        title="Social listening"
        subtitle={`Recurring themes in how people talk about ${artist.name} — Wikipedia, YouTube, and press coverage combined`}
      />

      {rowError ? (
        <div className="mt-4 rounded-lg border border-dashed border-red-400/40 p-8 text-center text-red-300/80">
          <p>
            Database error reading conversation_themes — this table probably doesn&apos;t exist yet. Run{" "}
            <code className="text-red-200">migrations/024_conversation_themes.sql</code> in Supabase, then
            refresh this page.
          </p>
          <p className="mt-3 text-xs text-red-300/60">{rowError.message}</p>
        </div>
      ) : !themes.length ? (
        <div className="mt-4">
          <BrandedEmptyState message={`No themes found yet — hit "Refresh Everything" below.`} />
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          <ConversationThemes themes={themes} />
          {wordCloud.length > 0 && <WordCloud entries={wordCloud} />}
        </div>
      )}

      <SiteFooter
        slug={slug}
        artistId={artist.id}
        tagline={artist.tagline}
        csvRows={csvRows}
        csvFilename={`${slug}-conversation-themes.csv`}
      />
    </div>
  );
}
