import { cache } from "react";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Artist } from "@/lib/database.types";

/** Shared by every /s/[slug]/* page/layout. Wrapped in React's cache() so
 * the layout and whichever page is rendering alongside it dedupe into a
 * single lookup per request instead of two — each tab navigation was
 * otherwise firing this query twice. Uses the service-role client since
 * authorization for the generated site happens at the edge (middleware.ts
 * checks the artist-name password cookie or a Supabase session), not via
 * RLS — visitors who only passed the password gate have no Supabase session
 * for RLS to key off of. */
export const getSiteArtist = cache(async (slug: string): Promise<Artist> => {
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase.from("artists").select("*").eq("slug", slug).single();
  if (!artist) notFound();
  return artist;
});
