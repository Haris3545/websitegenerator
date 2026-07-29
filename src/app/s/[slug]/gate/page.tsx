import { createServiceRoleClient } from "@/lib/supabase/server";
import { GateForm } from "@/components/site/GateForm";

export default async function GatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase
    .from("artists")
    .select(
      "id, accent_color, gate_background_url, gate_scrim_opacity, gate_grain_intensity, gate_grain_monochrome, project_title, tagline, font_family"
    )
    .eq("slug", slug)
    .maybeSingle();

  return (
    <GateForm
      slug={slug}
      backgroundUrl={artist?.gate_background_url ?? null}
      accentColor={artist?.accent_color ?? "#eab308"}
      projectTitle={artist?.project_title ?? "The Recording Studio"}
      tagline={artist?.tagline ?? "VCCP Cultural Intelligence"}
      fontFamily={artist?.font_family ?? "Inter"}
      scrimOpacity={artist?.gate_scrim_opacity ?? 0.55}
      grainIntensity={artist?.gate_grain_intensity ?? 0}
      grainMonochrome={artist?.gate_grain_monochrome ?? false}
    />
  );
}
