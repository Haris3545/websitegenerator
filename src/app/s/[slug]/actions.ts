"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { refreshMediaForArtist } from "@/lib/media";
import { refreshSentimentNow } from "@/lib/sentiment";
import { refreshEventsForArtist } from "@/lib/events";
import { refreshYoutubeStats } from "@/lib/youtube";
import { refreshSocialListeningForArtist } from "@/lib/socialListening";
import { refreshMusicStats } from "@/lib/music";
import { refreshInsightsNow } from "@/lib/insights";
import { refreshWikipediaTrendsNow } from "@/lib/wikipedia";
import { computeArtistPassword, artistAccessCookieName } from "@/lib/artistAccess";
import { artistCacheTag } from "@/lib/getSiteArtist";
import { ALL_TAB_KEYS } from "@/lib/tabs";
import type { ThemeOverrides } from "@/lib/theme";
import type { SentimentFilter, BoardItem, TabKey } from "@/lib/database.types";

/** These six steps are independent of each other — running them
 * sequentially (as this used to) meant the total wall-clock time was their
 * SUM, which easily blew past Vercel's default serverless function timeout
 * once insights/sentiment/events/social-listening were all making their own
 * Gemini calls: four+ sequential LLM round trips reliably crossed 10s+ and
 * the whole action (and the page navigation waiting on it) would get killed
 * mid-flight, which is what actually produced the "page crashed" / 404
 * behavior — not a bug in any single step. Running them concurrently caps
 * the time at the SLOWEST single step instead. Only insights depends on
 * everything else having finished (it reads across all the refreshed data),
 * so it alone still has to run last. */
const STEP_LABELS = ["media", "sentiment", "events", "youtube", "social listening", "music"] as const;

export async function refreshEverything(slug: string) {
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("id, name, youtube_channel_id")
    .eq("slug", slug)
    .single();

  if (!artist) return;

  const results = await Promise.allSettled([
    refreshMediaForArtist(artist.id, artist.name),
    refreshSentimentNow(artist.id, artist.name),
    refreshEventsForArtist(artist.id, artist.name),
    artist.youtube_channel_id
      ? refreshYoutubeStats(artist.id, artist.youtube_channel_id)
      : Promise.resolve(),
    refreshSocialListeningForArtist(artist.id, artist.name),
    refreshMusicStats(artist.id, artist.name),
  ]);

  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`refreshEverything: ${STEP_LABELS[i]} refresh failed for ${slug}:`, result.reason);
    }
  });

  // Both of these read across data refreshed above (insights reads
  // everything; Wikipedia trends reads the just-refreshed album list), but
  // not across each other, so they run alongside one another rather than
  // adding another fully sequential step.
  const { data: musicRow } = await supabase
    .from("music_stats")
    .select("top_albums")
    .eq("artist_id", artist.id)
    .maybeSingle();

  await Promise.allSettled([
    refreshInsightsNow(artist.id, artist.name).catch((err) =>
      console.error(`refreshEverything: insights refresh failed for ${slug}:`, err)
    ),
    refreshWikipediaTrendsNow(artist.id, artist.name, (musicRow?.top_albums ?? []).map((a) => a.name)).catch(
      (err) => console.error(`refreshEverything: Wikipedia trends refresh failed for ${slug}:`, err)
    ),
  ]);

  updateTag(artistCacheTag(slug));
  revalidatePath(`/s/${slug}`, "layout");
}

/** Saves manually-edited filter definitions from the Dashboard tab's filter
 * editor. These survive future sentiment recomputes (see
 * refreshSentimentNow) since a human redefining what a filter means should
 * stick until they change it again, not get silently overwritten. */
export async function updateSentimentFilters(artistId: string, filters: SentimentFilter[]) {
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("slug, sentiment_summary")
    .eq("id", artistId)
    .maybeSingle();

  await supabase
    .from("artists")
    .update({
      sentiment_summary: { ...artist?.sentiment_summary, filters },
    })
    .eq("id", artistId);

  if (artist?.slug) updateTag(artistCacheTag(artist.slug));
  revalidatePath(`/s/[slug]`, "layout");
}

/** Saves a right-click edit to a piece of static site copy (see
 * Editable.tsx). An empty/blank value clears the override, reverting to
 * whatever's baked into the component. */
export async function updateContentOverride(artistId: string, key: string, value: string) {
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("slug, content_overrides")
    .eq("id", artistId)
    .maybeSingle();

  const next = { ...(artist?.content_overrides ?? {}) };
  const trimmed = value.trim();
  if (trimmed) {
    next[key] = trimmed;
  } else {
    delete next[key];
  }

  await supabase.from("artists").update({ content_overrides: next }).eq("id", artistId);
  if (artist?.slug) updateTag(artistCacheTag(artist.slug));
  revalidatePath(`/s/[slug]`, "layout");
}

/** Saves a drag-reorder or a tab/card removal made directly on the live
 * site in edit mode (see NavPills and DashboardKpiGrid) — the nav pills
 * and the Dashboard's KPI cards are both just different renderings of this
 * one enabled_tabs array, so reordering or removing either one updates the
 * same underlying, permanently-persisted list. "dashboard" is filtered out
 * defensively even though the UI never lets it be dragged/removed — it's
 * always force-included as tab order's fixed first entry. */
export async function updateTabOrder(artistId: string, orderedTabs: TabKey[]) {
  const validTabs = orderedTabs.filter((t) => ALL_TAB_KEYS.includes(t) && t !== "dashboard");
  const enabled_tabs: TabKey[] = ["dashboard", ...validTabs];

  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase.from("artists").select("slug").eq("id", artistId).maybeSingle();

  await supabase.from("artists").update({ enabled_tabs }).eq("id", artistId);
  if (artist?.slug) updateTag(artistCacheTag(artist.slug));
  revalidatePath(`/s/[slug]`, "layout");
}

/** Same drag-reorder-then-persist shape as updateTabOrder, but for the
 * Dashboard's own content sections ("What we've noticed", Wikipedia
 * pageviews, "Most relevant coverage") rather than the tab bar/KPI cards. */
export async function updateDashboardSectionOrder(artistId: string, order: string[]) {
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase.from("artists").select("slug").eq("id", artistId).maybeSingle();

  await supabase.from("artists").update({ dashboard_section_order: order }).eq("id", artistId);
  if (artist?.slug) updateTag(artistCacheTag(artist.slug));
  revalidatePath(`/s/[slug]`, "layout");
}

/** Persists the quick aesthetic tweaks made from the on-site edit-mode panel
 * (see AestheticPanel) — colours, font, and the card look knobs the builder's
 * own ThemeEditor also exposes. Deeper background-image adjustments (pan/
 * zoom/contrast) stay in the builder's dedicated editor, where there's room
 * for a real preview to drag against. */
export async function updateArtistAesthetics(
  artistId: string,
  aesthetics: {
    primary_color: string;
    accent_color: string;
    font_family: string;
    theme_overrides: ThemeOverrides;
  }
) {
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase.from("artists").select("slug").eq("id", artistId).maybeSingle();

  await supabase
    .from("artists")
    .update({
      primary_color: aesthetics.primary_color,
      accent_color: aesthetics.accent_color,
      font_family: aesthetics.font_family,
      theme_overrides: aesthetics.theme_overrides,
    })
    .eq("id", artistId);
  if (artist?.slug) updateTag(artistCacheTag(artist.slug));
  revalidatePath(`/s/[slug]`, "layout");
}

/** Checks the password entered on /s/[slug]/gate against the artist's
 * name-derived password and, on success, sets a long-lived cookie that
 * grants read access to the site (see middleware.ts). Data on the generated
 * site is fetched with the service-role client rather than gated by
 * Supabase Auth/RLS, since this cookie — not a real user session — is what
 * authorizes the visitor from here on. */
export async function verifyArtistAccess(
  slug: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceRoleClient();
  const { data: artist, error } = await supabase
    .from("artists")
    .select("name")
    .eq("slug", slug)
    .maybeSingle();

  if (error) return { ok: false, error: `Artist lookup failed: ${error.message}` };
  if (!artist) return { ok: false, error: `No artist found for slug "${slug}".` };

  if (password.trim().toLowerCase() !== computeArtistPassword(artist.name)) {
    return { ok: false };
  }

  const cookieStore = await cookies();
  cookieStore.set(artistAccessCookieName(slug), "granted", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });

  redirect(`/s/${slug}`);
}

/** Clears the artist-name password cookie and sends the visitor back to
 * the gate page — the only way back to it once you're past it, since the
 * cookie otherwise lasts 180 days. */
export async function logOutOfArtistSite(slug: string) {
  const cookieStore = await cookies();
  cookieStore.delete(artistAccessCookieName(slug));
  redirect(`/s/${slug}/gate`);
}

/** Adds a card to one of the Strategy/Tactics/Ideas/Research boards. */
export async function addBoardItem(
  artistId: string,
  boardKey: string,
  title: string,
  body: string
): Promise<{ ok: true; item: BoardItem } | { ok: false; error: string }> {
  if (!title.trim()) return { ok: false, error: "Title can't be empty." };

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("board_items")
    .insert({ artist_id: artistId, board_key: boardKey, title: title.trim(), body: body.trim() })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/s/[slug]`, "layout");
  return { ok: true, item: data };
}

export async function deleteBoardItem(itemId: string) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("board_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath(`/s/[slug]`, "layout");
}
