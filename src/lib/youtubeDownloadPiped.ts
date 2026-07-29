// Public instances of Piped (an open-source YouTube front-end) — these
// rotate/go down over time since they're volunteer-run, which is why this
// tries several in sequence rather than hardcoding one. See
// https://github.com/TeamPiped/Piped/wiki/Instances for the current list if
// this whole file starts failing across the board.
const PIPED_API_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee",
  "https://piped-api.hostux.net",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.smnz.de",
  "https://piped-api.codespace.cz",
  "https://pipedapi.drgns.space",
];

const MAX_HEIGHT = 1080;

type PipedStream = {
  url?: string;
  quality?: string;
  height?: number;
  videoOnly?: boolean;
};

type PipedStreamsResponse = { videoStreams?: PipedStream[] };

async function fetchFromInstance(base: string, videoId: string): Promise<{ url: string; headers: Record<string, string> }> {
  // Every throw in this function must carry `base` — a raw fetch()
  // rejection (DNS failure, connection refused, timeout) throws a bare
  // "fetch failed" with zero indication of which instance that came from,
  // which is exactly the gap that made the last real failure here
  // undiagnosable (two dead instances just showed up as two identical
  // unlabeled "fetch failed" entries).
  try {
    const res = await fetch(`${base}/streams/${videoId}`, {
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data: PipedStreamsResponse = await res.json();
    const streams = (data.videoStreams ?? []).filter((s) => s.videoOnly && s.url);
    if (!streams.length) throw new Error("no video-only streams in response");

    const withinCap = streams.filter((s) => !s.height || s.height <= MAX_HEIGHT);
    const pool = withinCap.length ? withinCap : streams;
    const best = pool.reduce((a, b) => ((b.height ?? 0) > (a.height ?? 0) ? b : a));

    // Piped's own stream URLs already point directly at the CDN — no
    // special headers needed the way a raw googlevideo.com URL resolved by
    // us would (see youtubeDownload.ts's BROWSER_USER_AGENT).
    return { url: best.url!, headers: {} };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${base}: ${message}`);
  }
}

/** Same job as resolveYoutubeFormatViaYtDlp (youtubeDownloadYtDlp.ts) —
 * resolve a direct, playable stream URL for downloadYoutubeClip's ffmpeg
 * trim step — but via Piped's public API instead of doing the extraction
 * ourselves. The point: Piped's own backend (running on its own IP, not
 * this deployment's) is what talks to YouTube's player/watch endpoints and
 * hands back an already-resolved CDN URL — the specific step that's been
 * failing here isn't something our own ffmpeg fetch of that CDN URL has
 * ever had trouble with (CDN segment URLs are signature/expiry-checked,
 * not bot-checked the way the page/API layer is), so this sidesteps the
 * whole problem rather than trying to out-fingerprint it again.
 *
 * Queries every candidate instance in parallel (Promise.any — first success
 * wins) rather than trying them one at a time: this whole download only has
 * ~60s total to work with (see maxDuration on the artist builder pages),
 * already shared with a yt-dlp attempt before this and a screen-record
 * fallback after it, so five sequential 8s timeouts (up to 40s alone) isn't
 * an affordable way to find out one instance is down. */
export async function resolveYoutubeFormatViaPiped(
  videoId: string
): Promise<{ url: string; headers: Record<string, string> }> {
  const attempts = PIPED_API_INSTANCES.map((base) => fetchFromInstance(base, videoId));

  try {
    return await Promise.any(attempts);
  } catch (aggregate) {
    const reasons =
      aggregate instanceof AggregateError
        ? aggregate.errors.map((e) => (e instanceof Error ? e.message : String(e))).join(" | ")
        : String(aggregate);
    throw new Error(`All Piped instances failed — ${reasons}`);
  }
}
