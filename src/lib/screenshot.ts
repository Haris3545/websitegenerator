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

/** Captures a screenshot of the artist's branded /preview-snapshot page
 * (a small, public, purpose-built stand-in for "what this dashboard looks
 * like" — see that page for why it's not a literal authenticated-dashboard
 * capture) via a free, keyless third-party rendering service (thum.io),
 * then re-hosts the resulting image in our own Supabase Storage — so every
 * later view of the icon in the builder is a fast, direct image load
 * instead of a live render-on-demand request to a third party (slow,
 * occasionally rate-limited, and previously wired straight into an
 * <img src>, meaning it fired on every single builder page load). Runs
 * once right after an artist is created (see builder/actions.ts), with a
 * lazy fallback the first time the gate page loads with nothing cached yet,
 * and re-triggered by clearGateScreenshotIfStale when a builder save
 * changes something the preview actually renders. A localhost host can't
 * be reached by an external service, so this is a no-op there — it only
 * does anything once actually deployed. */
export async function captureGateScreenshot(artistId: string, slug: string): Promise<void> {
  try {
    const siteBaseUrl = await getSiteBaseUrl();
    if (siteBaseUrl.includes("localhost") || siteBaseUrl.includes("127.0.0.1")) return;

    // The builder's icon renders this at a small wide "browser window" box
    // (see SiteGlyph in ArtistsBoard.tsx, an 8:5 box) — width/crop below
    // match that ratio at a reasonable 4x for retina, so object-cover shows
    // the whole preview rather than cropping into it. wait/2 gives the
    // Google Font a moment to actually load before the shot is taken.
    const shotUrl = `https://image.thum.io/get/width/320/crop/200/wait/2/noanimate/${siteBaseUrl}/s/${slug}/preview-snapshot`;
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
