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

// WordPress's mShots is used instead of a service like thum.io: it's been
// free and keyless for well over a decade with no signup/authKey required
// at any volume, where several "free tier" screenshot APIs turned out to
// throttle or reject unauthenticated requests entirely once their public
// quota was exhausted (which is what repeated blank/never-populated
// captures pointed to here) — thum.io among them. mShots renders a new URL
// asynchronously: the very first request for a URL it hasn't seen before
// returns a small "generating…" placeholder immediately, with the real
// screenshot only ready a few seconds later, hence the retry loop.
const MSHOTS_PLACEHOLDER_MAX_BYTES = 2500;
const MSHOTS_MAX_ATTEMPTS = 3;
const MSHOTS_RETRY_DELAY_MS = 2000;

async function fetchScreenshot(targetUrl: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const shotUrl = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(targetUrl)}?w=320&h=200`;

  for (let attempt = 0; attempt < MSHOTS_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(shotUrl, { headers: { "User-Agent": "websitegenerator:screenshot:v1.0" } });
    if (res.ok) {
      const contentType = res.headers.get("content-type") ?? "image/png";
      const bytes = await res.arrayBuffer();
      // Still the "generating" placeholder — real screenshots run well
      // past this. Keep waiting rather than caching that placeholder.
      if (bytes.byteLength > MSHOTS_PLACEHOLDER_MAX_BYTES) return { bytes, contentType };
    }
    if (attempt < MSHOTS_MAX_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, MSHOTS_RETRY_DELAY_MS));
    }
  }
  return null;
}

/** Captures a screenshot of the artist's branded /preview-snapshot page
 * (a small, public, purpose-built stand-in for "what this dashboard looks
 * like" — see that page for why it's not a literal authenticated-dashboard
 * capture), then re-hosts the resulting image in our own Supabase Storage —
 * so every later view of the icon in the builder is a fast, direct image
 * load instead of a live render-on-demand request to a third party (slow,
 * and if the third party's free tier is throttled, occasionally coming
 * back blank forever). Runs once right after an artist is created (see
 * builder/actions.ts), with a lazy fallback the first time the gate page
 * loads with nothing cached yet, and re-triggered by gateVisualsChanged
 * when a builder save changes something the preview actually renders. A
 * localhost host can't be reached by an external service, so this is a
 * no-op there — it only does anything once actually deployed. */
export async function captureGateScreenshot(artistId: string, slug: string): Promise<void> {
  try {
    const siteBaseUrl = await getSiteBaseUrl();
    if (siteBaseUrl.includes("localhost") || siteBaseUrl.includes("127.0.0.1")) return;

    const shot = await fetchScreenshot(`${siteBaseUrl}/s/${slug}/preview-snapshot`);
    if (!shot) return;

    const ext = shot.contentType.includes("jpeg") || shot.contentType.includes("jpg") ? "jpg" : "png";
    const path = `gate-screenshots/${artistId}.${ext}`;
    const supabase = createServiceRoleClient();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, shot.bytes, { contentType: shot.contentType, upsert: true });
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
