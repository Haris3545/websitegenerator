import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { refreshEverything } from "@/app/s/[slug]/actions";

// Twice a day (see vercel.json) across every artist — refreshEverything
// itself already deliberately excludes Gemini/SerpApi-quota-limited calls
// (see its own comment), so running it on a schedule for every artist is
// safe the same way the manual "Refresh Everything" button always was.
export const maxDuration = 300;

/** Replaces the old media-only cron — refreshEverything already includes
 * media as one of its steps, so a separate daily media-only sweep was just
 * redundant. Runs artists sequentially (not Promise.all across artists) to
 * avoid firing every artist's whole batch of external API calls at once;
 * refreshEverything itself already parallelizes the independent sources
 * within a single artist. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createServiceRoleClient();
  const { data: artists, error } = await supabase.from("artists").select("slug");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: { slug: string; ok: boolean; error?: string }[] = [];
  for (const artist of artists ?? []) {
    try {
      await refreshEverything(artist.slug);
      results.push({ slug: artist.slug, ok: true });
    } catch (err) {
      results.push({ slug: artist.slug, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ refreshedArtists: results.length, results });
}
