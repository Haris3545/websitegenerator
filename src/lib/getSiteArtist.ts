import { cache } from "react";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Artist } from "@/lib/database.types";

const STALE_AFTER_SECONDS = 20;

export function artistCacheTag(slug: string) {
  return `artist-${slug}`;
}

/** Shared by every /s/[slug]/* page/layout. Wrapped in React's cache() so
 * the layout and whichever page is rendering alongside it dedupe into a
 * single lookup per request, and in Next's data cache so most tab switches
 * within a few seconds of each other skip the database round trip
 * entirely — this lookup was otherwise the first of 2-3 sequential round
 * trips on every single navigation, the main contributor to slow tab
 * switching. Direct edits (the builder, inline content editing, sentiment
 * filters, publish/unpublish, "Refresh Everything") call
 * updateTag(artistCacheTag(slug)) to bust this immediately rather than
 * waiting out the window. */
export const getSiteArtist = cache(async (slug: string): Promise<Artist> => {
  const artist = await unstable_cache(
    async () => {
      const supabase = createServiceRoleClient();
      const { data } = await supabase.from("artists").select("*").eq("slug", slug).single();
      return data;
    },
    [`site-artist-${slug}`],
    { revalidate: STALE_AFTER_SECONDS, tags: [artistCacheTag(slug)] }
  )();

  if (!artist) notFound();
  return artist;
});
