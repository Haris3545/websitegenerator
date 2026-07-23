import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ArtistForm } from "@/components/builder/ArtistForm";

export default async function EditArtistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: artist } = await supabase.from("artists").select("*").eq("id", id).single();

  if (!artist) notFound();

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Edit {artist.name}</h1>
      <ArtistForm artist={artist} />
    </div>
  );
}
