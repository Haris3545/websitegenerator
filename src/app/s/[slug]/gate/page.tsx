import { createServiceRoleClient } from "@/lib/supabase/server";
import { GateForm } from "@/components/site/GateForm";

export default async function GatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("secondary_color, accent_color, gate_background_url, project_title, tagline, font_family")
    .eq("slug", slug)
    .maybeSingle();

  return (
    <GateForm
      slug={slug}
      backgroundUrl={artist?.gate_background_url ?? null}
      backgroundColor={artist?.secondary_color ?? "#0a0a0a"}
      accentColor={artist?.accent_color ?? "#eab308"}
      projectTitle={artist?.project_title ?? "The Recording Studio"}
      tagline={artist?.tagline ?? "VCCP Cultural Intelligence"}
      fontFamily={artist?.font_family ?? "Inter"}
    />
  );
}
