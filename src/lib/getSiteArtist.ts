import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Artist } from "@/lib/database.types";

/** Shared by every /s/[slug]/* page. Uses the service-role client since
 * authorization for the generated site happens at the edge (middleware.ts
 * checks the artist-name password cookie or a Supabase session), not via
 * RLS — visitors who only passed the password gate have no Supabase session
 * for RLS to key off of. */
export async function getSiteArtist(slug: string): Promise<Artist> {
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase.from("artists").select("*").eq("slug", slug).single();
  if (!artist) notFound();
  return artist;
}
