"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseAestheticPrompt } from "@/lib/aesthetic";
import { publishArtistSite, unpublishArtistSite, type PublishResult, type UnpublishResult } from "@/lib/publish";
import { parseAudienceFile, storeAudienceUpload } from "@/lib/audience";
import { resolveYoutubeChannel, type YoutubeChannelLookup } from "@/lib/youtube";
import { ALL_TAB_KEYS } from "@/lib/tabs";
import { artistCacheTag } from "@/lib/getSiteArtist";
import type { TabKey } from "@/lib/database.types";
import type { ThemeOverrides } from "@/lib/theme";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/builder/login");
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
    const aesthetic_params = await parseAestheticPrompt(input.aesthetic_prompt);

    const row = {
      slug: input.slug,
      name: input.name,
      primary_color: input.primary_color,
      secondary_color: input.secondary_color,
      accent_color: input.accent_color,
      font_family: input.font_family,
      background_image_url: input.background_image_url,
      gate_background_url: input.gate_background_url,
      youtube_channel_id: input.youtube_channel_id,
      aesthetic_prompt: input.aesthetic_prompt,
      aesthetic_params,
      tagline: input.tagline,
      project_title: input.project_title,
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

export async function deleteArtist(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("artists").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/builder/artists");
}

export async function publishArtist(artistId: string): Promise<PublishResult> {
  const result = await publishArtistSite(artistId);
  if (result.ok) {
    revalidatePath(`/builder/artists/${artistId}`);
    await revalidateArtistCacheById(artistId);
  }
  return result;
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
