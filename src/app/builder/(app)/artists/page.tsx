import { after } from "next/server";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ArtistsBoard } from "@/components/builder/ArtistsBoard";
import { BrandedEmptyState } from "@/components/BrandedEmptyState";
import { captureGateScreenshot } from "@/lib/screenshot";

export default async function ArtistsPage() {
  const supabase = await createClient();
  const [{ data: artists, error: artistsError }, { data: folders }] = await Promise.all([
    supabase
      .from("artists")
      .select("id, name, slug, updated_at, folder_id, sort_order, primary_color, gate_screenshot_url")
      .order("sort_order", { ascending: true }),
    supabase.from("artist_folders").select("id, name, position").order("position", { ascending: true }),
  ]);

  // Self-heals any artist that's never gotten a thumbnail at all (e.g. one
  // created before the screenshot pipeline existed) — an artist whose
  // capture came back blank/broken still has a non-null URL though, so
  // this can't catch that case; recaptureScreenshot (see builder/actions.ts,
  // wired to a manual "Recapture" control) covers it instead.
  for (const artist of artists ?? []) {
    if (!artist.gate_screenshot_url) after(() => captureGateScreenshot(artist.id, artist.slug));
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Artists</h1>
          <p className="text-sm text-neutral-500 dark:text-white/40">
            Click a folder to open it, or a site for options. Drag icons to organize.
          </p>
        </div>
        <Link
          href="/builder/artists/new"
          className="rounded-lg bg-builder-accent px-4 py-2 text-sm font-semibold text-black transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:brightness-95"
        >
          + New artist
        </Link>
      </div>

      {artistsError ? (
        <div className="rounded-xl border border-dashed border-red-400 bg-red-50 p-8 text-center text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          <p>
            Database error reading artists — this is very likely a missing column a migration adds. Run{" "}
            <code>migrations/026_gate_screenshot.sql</code> in Supabase, then reload this page.
          </p>
          <p className="mt-2 text-xs opacity-70">{artistsError.message}</p>
        </div>
      ) : !artists?.length ? (
        <BrandedEmptyState variant="builder" message="No artist dashboards yet. Create the first one to get started." />
      ) : (
        <ArtistsBoard initialArtists={artists} initialFolders={folders ?? []} />
      )}
    </div>
  );
}
