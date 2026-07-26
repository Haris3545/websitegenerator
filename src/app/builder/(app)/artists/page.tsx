import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ArtistsBoard } from "@/components/builder/ArtistsBoard";
import { BrandedEmptyState } from "@/components/BrandedEmptyState";

export default async function ArtistsPage() {
  const supabase = await createClient();
  const [{ data: artists }, { data: folders }] = await Promise.all([
    supabase
      .from("artists")
      .select("id, name, slug, updated_at, folder_id, sort_order, primary_color, gate_screenshot_url")
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
          className="rounded-lg bg-builder-accent px-4 py-2 text-sm font-semibold text-black transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:brightness-95"
        >
          + New artist
        </Link>
      </div>

      {!artists?.length ? (
        <BrandedEmptyState variant="builder" message="No artist dashboards yet. Create the first one to get started." />
      ) : (
        <ArtistsBoard initialArtists={artists} initialFolders={folders ?? []} />
      )}
    </div>
  );
}
