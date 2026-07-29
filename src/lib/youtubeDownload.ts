import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ytdl from "@distube/ytdl-core";
import ffmpegPath from "ffmpeg-static";
import { recordYoutubeClipViaBrowser } from "@/lib/youtubeScreenRecord";

const execFileAsync = promisify(execFile);

const MAX_CLIP_SECONDS = 12; // small buffer over the 10s the builder's trimmer enforces
// Background loops are always muted and capped to a small viewport-filling
// crop, so there's no reason to keep 4K/8K source resolution around — this
// keeps both the download and the resulting file small and fast.
const MAX_HEIGHT = 1080;
// A googlevideo.com URL rejects requests that don't look like they came
// from a real browser — matching a common Chrome UA avoids that 403 rather
// than fighting it after the fact.
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function parseCookieHeader(raw: string): { name: string; value: string }[] {
  return raw
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf("=");
      if (idx === -1) return null;
      return { name: pair.slice(0, idx).trim(), value: pair.slice(idx + 1).trim() };
    })
    .filter((c): c is { name: string; value: string } => !!c?.name && !!c.value);
}

// Requests from a cloud/serverless IP with no session at all are exactly
// what triggers YouTube's "Sign in to confirm you're not a bot" check on
// ytdl.getInfo() — a real browser hitting the same endpoint from a
// residential IP with a logged-in session doesn't see it. Signing in as a
// real account and copying that session's cookies (e.g. via a browser
// extension like "Get cookies.txt") into YOUTUBE_COOKIE as one semicolon-
// separated string is the standard workaround every ytdl-core-family tool
// needs for this; without it, this only works for videos YouTube doesn't
// flag (much of the time, but not reliably). Built lazily rather than at
// module load so a missing/malformed cookie value fails per-download
// rather than crashing the whole server on startup.
function buildAgent() {
  const raw = process.env.YOUTUBE_COOKIE;
  if (!raw) return undefined;
  const cookies = parseCookieHeader(raw);
  if (!cookies.length) return undefined;
  return ytdl.createAgent(cookies);
}

/** Picks the best video-only stream at or under MAX_HEIGHT — video-only
 * (rather than a combined video+audio format) because this is only ever
 * played back muted, so there's no reason to pull down audio data at all.
 * Falls back to the highest video-only format available if nothing is at
 * or under the cap (some very short/low-quality uploads only offer a
 * couple of formats total). */
function pickFormat(formats: ytdl.videoFormat[]): ytdl.videoFormat {
  const videoOnly = formats.filter((f) => f.hasVideo && !f.hasAudio);
  const candidates = videoOnly.length ? videoOnly : formats.filter((f) => f.hasVideo);
  if (!candidates.length) throw new Error("This video doesn't have any usable video stream.");

  const withinCap = candidates.filter((f) => !f.height || f.height <= MAX_HEIGHT);
  const pool = withinCap.length ? withinCap : candidates;
  return pool.reduce((best, f) => ((f.height ?? 0) > (best.height ?? 0) ? f : best));
}

/** Downloads the [start, end) window of a YouTube video as a standalone
 * H.264 mp4 file, ready to be uploaded and played back like any other
 * background upload (a plain looping <video> tag) — no YouTube iframe
 * embed involved at playback time at all. That embed approach kept
 * flashing YouTube's own captions/pause-button chrome for a frame or two
 * around every loop-back seek, which no player parameter or crossfade
 * trick fully eliminated; a real downloaded file has no player chrome to
 * flash in the first place.
 *
 * This leans on @distube/ytdl-core to resolve a direct, signed CDN URL for
 * the video (reverse-engineered from YouTube's own player, not an official
 * API — the same technique effectively every "download this YouTube
 * video" tool uses, and the reason this can occasionally break when
 * YouTube changes something and needs a dependency bump) and ffmpeg
 * (bundled via ffmpeg-static, no system install required) to trim and
 * re-encode it. ffmpeg reads directly from that CDN URL over HTTP — the
 * clip is only ever a few seconds, so this doesn't download the full
 * source video, just the byte range ffmpeg's input-side seek needs. */
export async function downloadYoutubeClip(
  videoId: string,
  start: number,
  end: number
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  if (!ytdl.validateID(videoId)) return { ok: false, error: "That doesn't look like a valid YouTube video." };
  const duration = end - start;
  if (!(duration > 0) || duration > MAX_CLIP_SECONDS) {
    return { ok: false, error: `Clip must be between 0 and ${MAX_CLIP_SECONDS} seconds.` };
  }
  if (!ffmpegPath) return { ok: false, error: "ffmpeg isn't available in this environment." };

  let tmpDir: string | null = null;
  try {
    const agent = buildAgent();
    const info = await ytdl.getInfo(videoId, agent ? { agent } : undefined);
    const format = pickFormat(info.formats);
    if (!format.url) return { ok: false, error: "Couldn't resolve a downloadable stream for that video." };

    tmpDir = await mkdtemp(path.join(tmpdir(), "yt-clip-"));
    const outputPath = path.join(tmpDir, "clip.mp4");

    await execFileAsync(
      ffmpegPath,
      [
        "-headers",
        `User-Agent: ${BROWSER_USER_AGENT}\r\n`,
        "-ss",
        String(Math.max(start, 0)),
        "-i",
        format.url,
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
    const message = err instanceof Error ? err.message : String(err);
    if (/sign in to confirm/i.test(message)) {
      // Even a valid YOUTUBE_COOKIE isn't always enough by itself anymore —
      // YouTube's bot check increasingly keys off the request's IP
      // reputation as much as session validity, and cloud/serverless IPs
      // (like Vercel's) get flagged regardless. Falls back to actually
      // rendering the real watch page in a headless browser and
      // screen-recording it instead of asking the data API for a direct
      // CDN URL — see youtubeScreenRecord.ts for why that's more likely to
      // get through.
      return recordYoutubeClipViaBrowser(videoId, start, end);
    }
    return { ok: false, error: `Couldn't download/trim that clip: ${message}` };
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
