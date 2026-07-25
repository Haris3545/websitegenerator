import { getSiteArtist } from "@/lib/getSiteArtist";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { AudienceTable } from "@/components/site/AudienceTable";
import { SiteFooter } from "@/components/site/SiteFooter";

export default async function AudiencePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const artist = await getSiteArtist(slug);

  const supabase = createServiceRoleClient();
  const { data: statements } = await supabase
    .from("audience_statements")
    .select("*")
    .eq("artist_id", artist.id);

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <div className="h-4 w-1 bg-[var(--accent)]" />
        <h2 className="text-lg font-bold uppercase">Audience</h2>
        <span className="text-sm text-white/40">Audience research statements</span>
      </div>

      {!statements?.length ? (
        <p className="mt-4 rounded-lg border border-dashed border-white/20 p-8 text-center text-white/50">
          No audience research uploaded yet — upload a GWI (or similar) export in the builder.
        </p>
      ) : (
        <div className="mt-4">
          <AudienceTable statements={statements} />
        </div>
      )}

      <SiteFooter
        slug={slug}
        artistId={artist.id}
        tagline={artist.tagline}
        csvRows={statements ?? []}
        csvFilename={`${slug}-audience.csv`}
      />
    </div>
  );
}
