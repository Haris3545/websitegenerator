"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { refreshMediaForArtist } from "@/lib/media";

export async function refreshEverything(slug: string) {
  const supabase = await createClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("id, name")
    .eq("slug", slug)
    .single();

  if (!artist) return;

  await refreshMediaForArtist(artist.id, artist.name);
  revalidatePath(`/s/${slug}`, "layout");
}
