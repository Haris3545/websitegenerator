import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { refreshMediaForArtist } from "@/lib/media";

export const maxDuration = 60;

/** Vercel Cron hits this on a schedule (see vercel.json) to keep every
 * artist's media cache warm, instead of relying only on the on-request
 * staleness check in refreshMediaIfStale. Runs artists sequentially to
 * avoid hammering Google News concurrently. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createServiceRoleClient();
  const { data: artists, error } = await supabase.from("artists").select("id, slug, name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: { slug: string; ok: boolean; articleCount?: number; error?: string }[] = [];
  for (const artist of artists ?? []) {
    try {
      const articleCount = await refreshMediaForArtist(artist.id, artist.name);
      results.push({ slug: artist.slug, ok: true, articleCount });
    } catch (err) {
      results.push({
        slug: artist.slug,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ refreshedArtists: results.length, results });
}
