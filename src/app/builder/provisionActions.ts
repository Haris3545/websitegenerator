"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { refreshMediaForArtist } from "@/lib/media";
import { refreshTicketmasterEventsOnly } from "@/lib/events";
import { refreshYoutubeStats } from "@/lib/youtube";
import { refreshSocialListeningForArtist } from "@/lib/socialListening";
import { refreshMusicStats } from "@/lib/music";
import { refreshGeniusAnnotations } from "@/lib/genius";
import { refreshWikipediaTrendsNow } from "@/lib/wikipedia";
import { refreshConversationThemesForArtist } from "@/lib/conversationThemes";
import { artistCacheTag } from "@/lib/getSiteArtist";

/** Granular, individually-callable counterparts to refreshEverything's
 * bundled call — used only by the builder's provisioning overlay
 * (ProvisioningOverlay.tsx) right after a brand-new artist is created, so
 * the client can track and show per-step progress rather than one opaque
 * multi-second await. Deliberately the same source set refreshEverything
 * already uses (no Gemini-backed sentiment/insights calls) for the same
 * reason documented there — this now runs once per artist at creation
 * rather than on a repeatedly-clickable button, but there's still no need
 * to duplicate what the dashboard/media tabs' own lazy "IfStale" refreshes
 * already handle on first visit. */

export type ProvisionResult = { ok: true } | { ok: false; error: string };

function toResult(err: unknown): ProvisionResult {
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
}

export async function provisionMedia(artistId: string, artistName: string): Promise<ProvisionResult> {
  try {
    await refreshMediaForArtist(artistId, artistName);
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function provisionEvents(artistId: string, artistName: string): Promise<ProvisionResult> {
  try {
    await refreshTicketmasterEventsOnly(artistId, artistName);
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function provisionYoutube(
  artistId: string,
  channelId: string | null
): Promise<ProvisionResult> {
  if (!channelId) return { ok: true };
  try {
    await refreshYoutubeStats(artistId, channelId);
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function provisionSocialListening(
  artistId: string,
  artistName: string
): Promise<ProvisionResult> {
  try {
    await refreshSocialListeningForArtist(artistId, artistName);
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function provisionMusic(artistId: string, artistName: string): Promise<ProvisionResult> {
  try {
    await refreshMusicStats(artistId, artistName);
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function provisionGenius(artistId: string, artistName: string): Promise<ProvisionResult> {
  try {
    await refreshGeniusAnnotations(artistId, artistName);
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

/** Reads back whatever provisionMusic just stored, same as
 * refreshEverything does, since Wikipedia trend comparisons need the
 * artist's own top albums by name. */
export async function provisionWikipediaTrends(
  artistId: string,
  artistName: string
): Promise<ProvisionResult> {
  try {
    const supabase = createServiceRoleClient();
    const { data: musicRow } = await supabase
      .from("music_stats")
      .select("top_albums")
      .eq("artist_id", artistId)
      .maybeSingle();
    await refreshWikipediaTrendsNow(artistId, artistName, (musicRow?.top_albums ?? []).map((a) => a.name));
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function provisionConversationThemes(
  artistId: string,
  artistName: string
): Promise<ProvisionResult> {
  try {
    await refreshConversationThemesForArtist(artistId, artistName);
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function finalizeProvisioning(slug: string) {
  updateTag(artistCacheTag(slug));
  revalidatePath(`/s/${slug}`, "layout");
}

/** The "visual check" pass — confirms rows actually landed for this artist
 * in each source's own table, rather than just trusting each step's own ok
 * result (a step can report success while still finding nothing to store,
 * e.g. no press coverage this week). Read by ProvisioningOverlay.tsx to
 * show a real ✓/⚠ per source instead of a generic "done." */
export async function checkProvisionedData(artistId: string): Promise<Record<string, number>> {
  const supabase = createServiceRoleClient();
  const count = async (table: string) => {
    const { count } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("artist_id", artistId);
    return count ?? 0;
  };

  const [media, events, youtube, social, music] = await Promise.all([
    count("media_articles"),
    count("artist_events"),
    count("youtube_stats"),
    count("social_comment_map"),
    count("music_stats"),
  ]);

  return { media, events, youtube, social, music };
}
