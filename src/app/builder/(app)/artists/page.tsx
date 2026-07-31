import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ArtistsBoard } from "@/components/builder/ArtistsBoard";
import { BrandedEmptyState } from "@/components/BrandedEmptyState";

export default async function ArtistsPage() {
  const supabase = await createClient();
  const [{ data: artists, error: artistsError }, { data: folders }] = await Promise.all([
    supabase
      .from("artists")
      .select(
        "id, name, slug, updated_at, folder_id, sort_order, primary_color, background_image_url, theme_overrides"
      )
      .order("sort_order", { ascending: true }),
    supabase.from("artist_folders").select("id, name, position").order("position", { ascending: true }),
  ]);

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
          className="rounded-lg bg-builder-accent px-4 py-2 text-sm font-semibold text-black transition-transform duration-150 ease-out [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-0.5 hover:brightness-95"
        >
          + New artist
        </Link>
      </div>

      {artistsError ? (
        <div className="rounded-xl border border-dashed border-red-400 bg-red-50 p-8 text-center text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          <p>
            Database error reading artists — this is very likely one or more migrations in{" "}
            <code>migrations/</code> not yet run against this Supabase project. Run every file there,
            in numeric order (the error below usually names the missing column/table), then reload
            this page.
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
