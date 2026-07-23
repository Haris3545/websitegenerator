"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { refreshMediaForArtist } from "@/lib/media";
import { computeArtistPassword, artistAccessCookieName } from "@/lib/artistAccess";

export async function refreshEverything(slug: string) {
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("id, name")
    .eq("slug", slug)
    .single();

  if (!artist) return;

  await refreshMediaForArtist(artist.id, artist.name);
  revalidatePath(`/s/${slug}`, "layout");
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
