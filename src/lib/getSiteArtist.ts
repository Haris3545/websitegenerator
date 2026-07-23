import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Artist } from "@/lib/database.types";

/** Shared by every /s/[slug]/* page: RLS-scoped fetch + 404 if not found or
 * not authorized (see migrations/001_init.sql policies). */
export async function getSiteArtist(slug: string): Promise<Artist> {
  const supabase = await createClient();
  const { data: artist } = await supabase.from("artists").select("*").eq("slug", slug).single();
  if (!artist) notFound();
  return artist;
}
