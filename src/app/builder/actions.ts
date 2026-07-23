"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseAestheticPrompt } from "@/lib/aesthetic";
import { encryptSecret } from "@/lib/crypto";
import { ALL_TAB_KEYS } from "@/lib/tabs";
import type { TabKey } from "@/lib/database.types";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/builder/login");
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
  landing_video_url: string | null;
  aesthetic_prompt: string;
  tagline: string;
  project_title: string;
  enabled_tabs: TabKey[];
};

export async function upsertArtist(input: ArtistFormInput) {
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
    landing_video_url: input.landing_video_url,
    aesthetic_prompt: input.aesthetic_prompt,
    aesthetic_params,
    tagline: input.tagline,
    project_title: input.project_title,
    enabled_tabs,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await supabase.from("artists").update(row).eq("id", input.id);
    if (error) throw new Error(`Failed to update artist in Supabase: ${error.message}`);
  } else {
    const { error } = await supabase.from("artists").insert(row);
    if (error) throw new Error(`Failed to create artist in Supabase: ${error.message}`);
  }

  revalidatePath("/builder/artists");
  redirect("/builder/artists");
}

export async function deleteArtist(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("artists").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/builder/artists");
}

/** API keys are encrypted before storage; never round-tripped back to the client.
 * Merges with whatever's already saved — a blank field means "leave this key
 * alone," not "clear it." */
export async function saveArtistSecrets(
  artistId: string,
  secrets: Record<string, string>
) {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("artist_secrets")
    .select("encrypted")
    .eq("artist_id", artistId)
    .maybeSingle();

  const encrypted: Record<string, string> = { ...(existing?.encrypted ?? {}) };
  for (const [key, value] of Object.entries(secrets)) {
    if (value) encrypted[key] = encryptSecret(value);
  }

  const { error } = await supabase
    .from("artist_secrets")
    .upsert({ artist_id: artistId, encrypted, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  revalidatePath(`/builder/artists/${artistId}`);
}

/** Which secret keys already have a value saved, without ever exposing the
 * decrypted value itself — used to show "already set" in the form. */
export async function getSavedSecretKeys(artistId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("artist_secrets")
    .select("encrypted")
    .eq("artist_id", artistId)
    .maybeSingle();
  return Object.keys(data?.encrypted ?? {});
}
