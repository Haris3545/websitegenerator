import { ArtistForm } from "@/components/builder/ArtistForm";

// Downloading + trimming a YouTube clip server-side (see
// downloadYoutubeClipAction) needs more than the platform's default
// serverless timeout — this applies to Server Actions invoked from this
// page too, not just its own render.
export const maxDuration = 60;

export default function NewArtistPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold tracking-tight">New artist</h1>
      <ArtistForm />
    </div>
  );
}
