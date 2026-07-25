import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteArtist } from "@/lib/getSiteArtist";
import { refreshConversationThemesForArtist, refreshConversationThemesIfStale } from "@/lib/conversationThemes";
import { ConversationThemes } from "@/components/site/ConversationThemes";
import { TabHeading } from "@/components/site/TabHeading";
import { SiteFooter } from "@/components/site/SiteFooter";

export default async function SocialListeningPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artist = await getSiteArtist(slug);

  const supabase = createServiceRoleClient();
  let { data: row } = await supabase
    .from("conversation_themes")
    .select("themes, computed_at")
    .eq("artist_id", artist.id)
    .maybeSingle();

  if (!row?.computed_at) {
    try {
      await refreshConversationThemesForArtist(artist.id, artist.project_title);
      ({ data: row } = await supabase
        .from("conversation_themes")
        .select("themes, computed_at")
        .eq("artist_id", artist.id)
        .maybeSingle());
    } catch (err) {
      console.error(`Initial conversation themes fetch failed for ${slug}:`, err);
    }
  } else {
    after(() => refreshConversationThemesIfStale(artist.id, artist.project_title));
  }

  const themes = row?.themes ?? [];
  const csvRows = themes.map((t) => ({ theme: t.name, count: t.count }));

  return (
    <div>
      <TabHeading
        artistId={artist.id}
        contentOverrides={artist.content_overrides}
        tabKey="social_listening"
        title="Social listening"
        subtitle={`Recurring themes in how people talk about ${artist.name} — Wikipedia, YouTube, and press coverage combined`}
      />

      {!themes.length ? (
        <p className="mt-4 rounded-lg border border-dashed border-white/20 p-8 text-center text-white/50">
          No themes found yet — hit &quot;Refresh Everything&quot; below.
        </p>
      ) : (
        <div className="mt-6">
          <ConversationThemes themes={themes} />
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
