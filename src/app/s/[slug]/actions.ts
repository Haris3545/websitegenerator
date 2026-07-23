"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { refreshMediaForArtist } from "@/lib/media";
import { refreshSentimentNow } from "@/lib/sentiment";
import { computeArtistPassword, artistAccessCookieName } from "@/lib/artistAccess";
import type { SentimentFilter } from "@/lib/database.types";

export async function refreshEverything(slug: string) {
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("id, name")
    .eq("slug", slug)
    .single();

  if (!artist) return;

  await refreshMediaForArtist(artist.id, artist.name);
  await refreshSentimentNow(artist.id, artist.name);
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
    .select("sentiment_summary")
    .eq("id", artistId)
    .maybeSingle();

  await supabase
    .from("artists")
    .update({
      sentiment_summary: { ...artist?.sentiment_summary, filters },
    })
    .eq("id", artistId);

  revalidatePath(`/s/[slug]`, "layout");
}

/** Saves a right-click edit to a piece of static site copy (see
 * Editable.tsx). An empty/blank value clears the override, reverting to
 * whatever's baked into the component. */
export async function updateContentOverride(artistId: string, key: string, value: string) {
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("content_overrides")
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
