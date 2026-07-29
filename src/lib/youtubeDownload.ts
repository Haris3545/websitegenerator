import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { resolveYoutubeFormatViaCobalt } from "@/lib/youtubeDownloadCobalt";

const execFileAsync = promisify(execFile);

const MAX_CLIP_SECONDS = 12; // small buffer over the 10s the builder's trimmer enforces
// A googlevideo.com (or Cobalt-proxied) URL can reject requests that don't
// look like they came from a real browser — used only when Cobalt doesn't
// hand back its own headers for a stream.
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Standard YouTube video ID shape — 11 URL-safe base64 characters. Only
// used to reject obvious garbage before spending a network round-trip on
// it; @distube/ytdl-core's own validateID() did this same check but pulling
// in the whole package just for this one regex wasn't worth it once its
// actual extraction was dropped (see git history: it, plain yt-dlp, and a
// headless-browser screen-record fallback were all tried and confirmed
// blocked from this deployment's IP — repeatedly, across many rounds —
// before landing on Cobalt as the only one that isn't).
const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

/** Downloads the [start, end) window of a YouTube video as a standalone
 * H.264 mp4 file, ready to be uploaded and played back like any other
 * background upload (a plain looping <video> tag) — no YouTube iframe
 * embed involved at playback time at all. That embed approach kept
 * flashing YouTube's own captions/pause-button chrome for a frame or two
 * around every loop-back seek, which no player parameter or crossfade
 * trick fully eliminated; a real downloaded file has no player chrome to
 * flash in the first place.
 *
 * Resolving a direct, playable stream URL is done via Cobalt
 * (youtubeDownloadCobalt.ts) — its own backend does the YouTube-facing
 * work on its infrastructure, not this deployment's. Every method that
 * tried to do that resolution here instead (a direct extraction library,
 * then a different one, then a headless browser with a real signed-in
 * session) hit the same "Sign in to confirm you're not a bot" wall every
 * time, which is why none of them are still in this file. ffmpeg (bundled
 * via ffmpeg-static, no system install required) then trims and
 * re-encodes, reading directly from Cobalt's resolved URL over HTTP — the
 * clip is only ever a few seconds, so this doesn't download the full
 * source video, just the byte range ffmpeg's input-side seek needs. */
export async function downloadYoutubeClip(
  videoId: string,
  start: number,
  end: number
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  if (!YOUTUBE_ID_PATTERN.test(videoId)) return { ok: false, error: "That doesn't look like a valid YouTube video." };
  const duration = end - start;
  if (!(duration > 0) || duration > MAX_CLIP_SECONDS) {
    return { ok: false, error: `Clip must be between 0 and ${MAX_CLIP_SECONDS} seconds.` };
  }
  if (!ffmpegPath) return { ok: false, error: "ffmpeg isn't available in this environment." };

  let url: string;
  let headers: Record<string, string>;
  try {
    ({ url, headers } = await resolveYoutubeFormatViaCobalt(videoId));
  } catch (err) {
    // Cobalt's own resolver already collects every candidate endpoint's
    // individual failure reason (see youtubeDownloadCobalt.ts) — surfaced
    // here verbatim, not summarized, so a failure names exactly which
    // endpoint(s) were tried and what each one actually said back.
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Couldn't resolve a stream via Cobalt — ${message}` };
  }

  let tmpDir: string | null = null;
  try {
    const headerLines =
      Object.entries(headers).length > 0
        ? Object.entries(headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\r\n") + "\r\n"
        : `User-Agent: ${BROWSER_USER_AGENT}\r\n`;

    tmpDir = await mkdtemp(path.join(tmpdir(), "yt-clip-"));
    const outputPath = path.join(tmpDir, "clip.mp4");

    await execFileAsync(
      ffmpegPath,
      [
        "-headers",
        headerLines,
        "-ss",
        String(Math.max(start, 0)),
        "-i",
        url,
        "-t",
        String(duration),
        "-an",
        "-vf",
        "scale='min(1280,iw)':-2",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-movflags",
        "+faststart",
        "-y",
        outputPath,
      ],
      { timeout: 45_000, maxBuffer: 1024 * 1024 * 32 }
    );

    const buffer = await readFile(outputPath);
    return { ok: true, buffer };
  } catch (err) {
    // Distinct from the resolve failure above — Cobalt *did* hand back a
    // stream, but ffmpeg couldn't fetch or trim it. Including the resolved
    // URL (truncated — these are long signed CDN links) makes it possible
    // to tell a dead/expired link apart from an ffmpeg-side problem.
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Cobalt resolved a stream but ffmpeg couldn't download/trim it — ${message} (url: ${url.slice(0, 200)})`,
    };
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
