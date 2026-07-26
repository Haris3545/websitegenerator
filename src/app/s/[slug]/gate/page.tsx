import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { captureGateScreenshot } from "@/lib/screenshot";
import { GateForm } from "@/components/site/GateForm";

export default async function GatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase
    .from("artists")
    .select(
      "id, secondary_color, accent_color, gate_background_url, gate_screenshot_url, project_title, tagline, font_family"
    )
    .eq("slug", slug)
    .maybeSingle();

  // First time this gate page has ever been visited with no cached
  // screenshot yet — capture one now, in the background, so the builder's
  // artist icon has something real to show without ever blocking this
  // page's own render on a slow third-party screenshot service.
  if (artist && !artist.gate_screenshot_url) {
    after(() => captureGateScreenshot(artist.id, slug));
  }

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
