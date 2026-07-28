"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseAestheticPrompt } from "@/lib/aesthetic";
import {
  publishArtistSite,
  unpublishArtistSite,
  checkPublishStatus as checkPublishStatusLib,
  type PublishResult,
  type UnpublishResult,
  type PublishStatus,
} from "@/lib/publish";
import { parseAudienceFile, storeAudienceUpload } from "@/lib/audience";
import { resolveYoutubeChannel, type YoutubeChannelLookup } from "@/lib/youtube";
import { ALL_TAB_KEYS } from "@/lib/tabs";
import { artistCacheTag } from "@/lib/getSiteArtist";
import type { AestheticParams, TabKey } from "@/lib/database.types";
import type { ThemeOverrides } from "@/lib/theme";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/builder/login");
}

/** Signs in server-side rather than from the browser Supabase client —
 * cookies get written via this same request/response cycle (createClient's
 * cookie adapter calls cookieStore.set as part of signInWithPassword
 * itself), so there's no cross-boundary timing gap left to race against.
 * The previous client-side signInWithPassword + hard-reload (+ later, a
 * session-poll) approach was still occasionally landing on the artists
 * list before the session was visible server-side, because the browser
 * client and the server's cookie-reading code are on two different clocks;
 * moving the sign-in itself onto the server removes that gap entirely. */
export async function signInAction(
  email: string,
  password: string,
  rememberMe: boolean = true
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };

  if (!rememberMe) {
    // Downgrade the auth cookies Supabase just set to session-only (no
    // maxAge) rather than persisting for Supabase's own default duration —
    // "Remember me" unchecked means signing back in is required once the
    // browser is fully closed, not any time before then.
    const cookieStore = await cookies();
    for (const cookie of cookieStore.getAll()) {
      if (cookie.name.startsWith("sb-")) {
        cookieStore.set(cookie.name, cookie.value, {
          path: "/",
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        });
      }
    }
  }

  return { ok: true };
}

/** Resolves whatever's pasted into the builder's YouTube field (a channel
 * URL, a video URL, a bare @handle) into the actual channel ID, so nobody
 * has to go find and copy that string by hand. */
export async function lookupYoutubeChannel(input: string): Promise<YoutubeChannelLookup> {
  return resolveYoutubeChannel(input);
}

export type ArtistFormInput = {
  id?: string;
  slug: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  font_family: string;
  background_image_url: string | null;
  gate_background_url: string | null;
  background_youtube_id: string | null;
  background_youtube_start: number;
  background_youtube_end: number | null;
  gate_youtube_id: string | null;
  gate_youtube_start: number;
  gate_youtube_end: number | null;
  gate_scrim_opacity: number;
  gate_grain_intensity: number;
  gate_grain_monochrome: boolean;
  youtube_channel_id: string | null;
  aesthetic_prompt: string;
  tagline: string;
  project_title: string;
  theme_overrides: ThemeOverrides;
  enabled_tabs: TabKey[];
};

/** Returns a result instead of throwing — Next.js redacts a Server Action's
 * thrown error message in production builds (replacing it with a generic
 * "Server Components render" digest message), so the only way for the
 * builder form to show the real failure reason is to hand it back as plain
 * data. Returns the artist's id on success (rather than redirecting itself)
 * so the caller can chain the deferred secrets/audience-upload steps a
 * brand-new artist needed a real id for, then navigate once those finish. */
export async function upsertArtist(
  input: ArtistFormInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();

    const enabled_tabs = input.enabled_tabs.filter((t) => ALL_TAB_KEYS.includes(t));

    const gateVisuals = {
      secondary_color: input.secondary_color,
      accent_color: input.accent_color,
      gate_background_url: input.gate_background_url,
      gate_youtube_id: input.gate_youtube_id,
      gate_youtube_start: input.gate_youtube_start,
      gate_youtube_end: input.gate_youtube_end,
      gate_scrim_opacity: input.gate_scrim_opacity,
      gate_grain_intensity: input.gate_grain_intensity,
      gate_grain_monochrome: input.gate_grain_monochrome,
      project_title: input.project_title,
      tagline: input.tagline,
      font_family: input.font_family,
    };

    // Re-parsing on every save would blow away whatever AestheticPanel's
    // manual sliders had set, since this free-text box is usually just
    // sitting there unchanged — only worth a fresh Gemini call when the
    // prompt text itself actually changed. A brand-new artist has nothing
    // to preserve, so it always parses (typically empty -> all-zero params).
    let aesthetic_params: AestheticParams | undefined;
    if (input.id) {
      const { data: existing } = await supabase
        .from("artists")
        .select("aesthetic_prompt, aesthetic_params")
        .eq("id", input.id)
        .maybeSingle();
      if (existing && existing.aesthetic_prompt === input.aesthetic_prompt) {
        aesthetic_params = existing.aesthetic_params;
      }
    }
    if (aesthetic_params === undefined) {
      aesthetic_params = await parseAestheticPrompt(input.aesthetic_prompt);
    }

    const row = {
      slug: input.slug,
      name: input.name,
      primary_color: input.primary_color,
      ...gateVisuals,
      background_image_url: input.background_image_url,
      background_youtube_id: input.background_youtube_id,
      background_youtube_start: input.background_youtube_start,
      background_youtube_end: input.background_youtube_end,
      youtube_channel_id: input.youtube_channel_id,
      aesthetic_prompt: input.aesthetic_prompt,
      aesthetic_params,
      theme_overrides: input.theme_overrides,
      enabled_tabs,
      updated_at: new Date().toISOString(),
    };

    let id = input.id;
    if (id) {
      const { error } = await supabase.from("artists").update(row).eq("id", id);
      if (error) return { ok: false, error: `Failed to update artist in Supabase: ${error.message}` };
    } else {
      const { data, error } = await supabase.from("artists").insert(row).select("id").single();
      if (error) return { ok: false, error: `Failed to create artist in Supabase: ${error.message}` };
      id = data.id;
    }

    revalidatePath("/builder/artists");
    revalidatePath(`/builder/artists/${id}`);
    updateTag(artistCacheTag(input.slug));

    return { ok: true, id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Something went wrong saving this artist.",
    };
  }
}

/** Deletes an artist entirely — the dashboard, all its cached data (media,
 * events, board items, etc. all cascade via FK on delete), and, if it was
 * published, the standalone GitHub repo + Vercel project too (those aren't
 * covered by the database cascade, so they'd otherwise be left running
 * indefinitely). */
export async function deleteArtist(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();

    const { data: artist } = await supabase
      .from("artists")
      .select("published_repo_url, slug")
      .eq("id", id)
      .maybeSingle();

    if (artist?.published_repo_url) {
      const result = await unpublishArtistSite(id);
      if (!result.ok) {
        return { ok: false, error: `Couldn't remove the published site first: ${result.error}` };
      }
    }

    const { error } = await supabase.from("artists").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };

    if (artist?.slug) updateTag(artistCacheTag(artist.slug));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to delete this artist." };
  }

  revalidatePath("/builder/artists");
  return { ok: true };
}

export async function publishArtist(artistId: string): Promise<PublishResult> {
  const result = await publishArtistSite(artistId);
  if (result.ok) {
    revalidatePath(`/builder/artists/${artistId}`);
    await revalidateArtistCacheById(artistId);
  }
  return result;
}

export async function checkPublishStatus(artistId: string): Promise<PublishStatus> {
  return checkPublishStatusLib(artistId);
}

export async function unpublishArtist(artistId: string): Promise<UnpublishResult> {
  const result = await unpublishArtistSite(artistId);
  if (result.ok) {
    revalidatePath(`/builder/artists/${artistId}`);
    await revalidateArtistCacheById(artistId);
  }
  return result;
}

async function revalidateArtistCacheById(artistId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("artists").select("slug").eq("id", artistId).maybeSingle();
  if (data?.slug) updateTag(artistCacheTag(data.slug));
}

export async function createFolder(name: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Folder name can't be empty." };

  const supabase = await createClient();
  const { count } = await supabase.from("artist_folders").select("id", { count: "exact", head: true });
  const { data, error } = await supabase
    .from("artist_folders")
    .insert({ name: trimmed, position: count ?? 0 })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/builder/artists");
  return { ok: true, id: data.id };
}

export async function renameFolder(id: string, name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Folder name can't be empty." };

  const supabase = await createClient();
  const { error } = await supabase.from("artist_folders").update({ name: trimmed }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/builder/artists");
  return { ok: true };
}

/** Deleting a folder never deletes the artists in it — they just fall back
 * to "no folder" (the FK is ON DELETE SET NULL), matching how a folder is
 * purely an organizational label, not a container that owns its contents. */
export async function deleteFolder(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("artist_folders").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/builder/artists");
  return { ok: true };
}

export async function reorderFolders(orderedIds: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, position) => supabase.from("artist_folders").update({ position }).eq("id", id))
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };

  revalidatePath("/builder/artists");
  return { ok: true };
}

/** Moves an artist card to a folder (or back to "no folder" with
 * folderId=null) and restamps sort_order for every artist in the
 * destination list, matching wherever it was dropped. */
export async function moveArtist(
  artistId: string,
  folderId: string | null,
  orderedArtistIdsInDestination: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { error: moveError } = await supabase
    .from("artists")
    .update({ folder_id: folderId })
    .eq("id", artistId);
  if (moveError) return { ok: false, error: moveError.message };

  const results = await Promise.all(
    orderedArtistIdsInDestination.map((id, sort_order) =>
      supabase.from("artists").update({ sort_order }).eq("id", id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };

  revalidatePath("/builder/artists");
  return { ok: true };
}

/** Parses and stores an uploaded GWI-style audience research export (CSV or
 * XLSX). Column matching is fuzzy — see src/lib/audience.ts — since export
 * formats vary; returns a clear error naming the headers it actually found
 * when it can't locate a statement/segment column. */
export async function uploadAudienceResearch(
  artistId: string,
  formData: FormData
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file received." };

  const buffer = await file.arrayBuffer();
  const parsed = await parseAudienceFile(buffer, file.name);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const stored = await storeAudienceUpload(artistId, file.name, parsed.rows);
  if (!stored.ok) return stored;

  revalidatePath(`/builder/artists/${artistId}`);
  return { ok: true, count: stored.count };
}
