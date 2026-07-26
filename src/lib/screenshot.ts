import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";

const BUCKET = "artist-media";

/** Whatever host this request actually came in on — works the same for a
 * custom domain, a Vercel preview URL, or local dev, unlike hardcoding one
 * canonical URL. Same derivation the builder's artists list already used
 * for the (now-removed) live screenshot <img>. */
export async function getSiteBaseUrl(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

/** Captures a screenshot of the artist's gate page via a free, keyless
 * third-party rendering service (thum.io), then re-hosts the resulting
 * image in our own Supabase Storage — so every later view of the icon in
 * the builder is a fast, direct image load instead of a live
 * render-on-demand request to a third party (slow, occasionally
 * rate-limited, and previously wired straight into an <img src>, meaning
 * it fired on every single builder page load). This only ever needs to run
 * once per artist: triggered the first time their gate page loads with no
 * cached screenshot yet, and re-triggered by clearGateScreenshotIfStale
 * when a builder save changes something the gate page actually renders.
 * A localhost host can't be reached by an external service, so this is a
 * no-op there — it only does anything once actually deployed. */
export async function captureGateScreenshot(artistId: string, slug: string): Promise<void> {
  try {
    const siteBaseUrl = await getSiteBaseUrl();
    if (siteBaseUrl.includes("localhost") || siteBaseUrl.includes("127.0.0.1")) return;

    // The builder's icon renders this at a tiny 56x48px (see SiteGlyph in
    // ArtistsBoard.tsx) — 480x640 was both ~10x too much resolution for
    // that and the wrong aspect ratio entirely (portrait vs. the icon's
    // landscape box), so object-cover was cropping a narrow vertical sliver
    // out of the middle rather than showing a sensible thumbnail. This
    // matches the icon's own 7:6 aspect ratio at a reasonable 4x for
    // retina. wait/3 gives the gate's background video/fonts a few seconds
    // to actually render a frame before the shot is taken — without it,
    // thum.io was capturing the page before the video started playing.
    const shotUrl = `https://image.thum.io/get/width/224/crop/192/wait/3/noanimate/${siteBaseUrl}/s/${slug}/gate`;
    const res = await fetch(shotUrl, { headers: { "User-Agent": "websitegenerator:screenshot:v1.0" } });
    if (!res.ok) return;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength < 500) return; // thum.io returns a tiny placeholder/error image on failure

    const ext = contentType.includes("png") ? "png" : "jpg";
    const path = `gate-screenshots/${artistId}.${ext}`;
    const supabase = createServiceRoleClient();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType, upsert: true });
    if (uploadError) {
      console.error(`captureGateScreenshot: upload failed for ${slug}:`, uploadError);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    // Cache-bust so the builder's icon updates immediately after a
    // re-capture instead of showing a browser-cached stale image at the
    // exact same URL.
    const bustedUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

    await supabase.from("artists").update({ gate_screenshot_url: bustedUrl }).eq("id", artistId);
  } catch (err) {
    console.error(`captureGateScreenshot failed for ${slug}:`, err);
  }
}

const GATE_VISUAL_FIELDS = [
  "secondary_color",
  "accent_color",
  "gate_background_url",
  "project_title",
  "tagline",
  "font_family",
] as const;

type GateVisuals = Record<(typeof GATE_VISUAL_FIELDS)[number], unknown>;

/** True only when a field the gate page actually renders changed — an
 * unrelated save (e.g. a new YouTube channel ID) shouldn't force a
 * needless re-capture of an otherwise-identical screenshot. */
export function gateVisualsChanged(before: GateVisuals, after: GateVisuals): boolean {
  return GATE_VISUAL_FIELDS.some((field) => before[field] !== after[field]);
}
