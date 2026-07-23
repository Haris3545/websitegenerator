import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function ArtistsPage() {
  const supabase = await createClient();
  const { data: artists } = await supabase
    .from("artists")
    .select("id, name, slug, updated_at")
    .order("updated_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Artists</h1>
        <Link
          href="/builder/artists/new"
          className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
        >
          + New artist
        </Link>
      </div>

      {!artists?.length ? (
        <p className="text-sm text-neutral-500">
          No artist dashboards yet. Create the first one to get started.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
          {artists.map((artist) => (
            <li key={artist.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium">{artist.name}</p>
                <p className="text-sm text-neutral-500">/s/{artist.slug}</p>
              </div>
              <div className="flex gap-3 text-sm">
                <Link href={`/s/${artist.slug}`} className="text-neutral-500 hover:underline">
                  View site
                </Link>
                <Link
                  href={`/builder/artists/${artist.id}`}
                  className="font-medium text-neutral-900 hover:underline"
                >
                  Edit
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
