import { getSiteArtist } from "@/lib/getSiteArtist";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { AudienceTable } from "@/components/site/AudienceTable";
import { TabHeading } from "@/components/site/TabHeading";
import { SiteFooter } from "@/components/site/SiteFooter";
import { BrandedEmptyState } from "@/components/BrandedEmptyState";

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
      <TabHeading
        artistId={artist.id}
        contentOverrides={artist.content_overrides}
        tabKey="audience"
        title="Audience"
        subtitle="Audience research statements"
      />

      {!statements?.length ? (
        <div className="mt-4">
          <BrandedEmptyState message="No audience research uploaded yet — upload a GWI (or similar) export in the builder." />
        </div>
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
