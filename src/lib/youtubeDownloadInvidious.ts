// Public instances of Invidious (a different open-source YouTube front-end
// than Piped, separately maintained) — kept as a distinct pool rather than
// merged into the Piped list so a bad day for one project's instances
// doesn't take out both at once. These rotate/go down over time too; see
// https://api.invidious.io/ for the current list if this whole file starts
// failing across the board.
const INVIDIOUS_API_INSTANCES = [
  "https://invidious.nerdvpn.de",
  "https://yewtu.be",
  "https://inv.nadeko.net",
  "https://invidious.jing.rocks",
  "https://iv.melmac.space",
];

const MAX_HEIGHT = 1080;

type InvidiousFormat = {
  url?: string;
  type?: string;
  qualityLabel?: string;
};

type InvidiousVideoResponse = { adaptiveFormats?: InvidiousFormat[] };

function heightFromQualityLabel(label: string | undefined): number {
  const match = label?.match(/(\d+)p/);
  return match ? Number(match[1]) : 0;
}

async function fetchFromInstance(base: string, videoId: string): Promise<{ url: string; headers: Record<string, string> }> {
  try {
    const res = await fetch(`${base}/api/v1/videos/${videoId}`, {
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data: InvidiousVideoResponse = await res.json();
    // adaptiveFormats mixes video-only and audio-only tracks — audio ones
    // have no qualityLabel at all, which is what distinguishes them here.
    const streams = (data.adaptiveFormats ?? []).filter(
      (f) => f.url && f.type?.startsWith("video/") && f.qualityLabel
    );
    if (!streams.length) throw new Error("no video streams in response");

    const withHeight = streams.map((s) => ({ ...s, height: heightFromQualityLabel(s.qualityLabel) }));
    const withinCap = withHeight.filter((s) => !s.height || s.height <= MAX_HEIGHT);
    const pool = withinCap.length ? withinCap : withHeight;
    const best = pool.reduce((a, b) => (b.height > a.height ? b : a));

    return { url: best.url!, headers: {} };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${base}: ${message}`);
  }
}

/** Same idea as resolveYoutubeFormatViaPiped (youtubeDownloadPiped.ts) — a
 * different open-source project, separately run instances, same reasoning
 * for why it might get past what's blocking direct extraction from this
 * deployment's own IP. Kept as its own module so youtubeDownload.ts can
 * race both pools together rather than depending on either single
 * project's instances all being up at once. */
export async function resolveYoutubeFormatViaInvidious(
  videoId: string
): Promise<{ url: string; headers: Record<string, string> }> {
  const attempts = INVIDIOUS_API_INSTANCES.map((base) => fetchFromInstance(base, videoId));

  try {
    return await Promise.any(attempts);
  } catch (aggregate) {
    const reasons =
      aggregate instanceof AggregateError
        ? aggregate.errors.map((e) => (e instanceof Error ? e.message : String(e))).join(" | ")
        : String(aggregate);
    throw new Error(`All Invidious instances failed — ${reasons}`);
  }
}
