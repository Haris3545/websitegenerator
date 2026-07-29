import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ytdl from "@distube/ytdl-core";
import ffmpegPath from "ffmpeg-static";
import { recordYoutubeClipViaBrowser } from "@/lib/youtubeScreenRecord";
import { resolveYoutubeFormatViaYtDlp } from "@/lib/youtubeDownloadYtDlp";

const execFileAsync = promisify(execFile);

const MAX_CLIP_SECONDS = 12; // small buffer over the 10s the builder's trimmer enforces
// A googlevideo.com URL rejects requests that don't look like they came
// from a real browser — used as a fallback only when yt-dlp doesn't hand
// back its own headers for a format (it normally does).
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Downloads the [start, end) window of a YouTube video as a standalone
 * H.264 mp4 file, ready to be uploaded and played back like any other
 * background upload (a plain looping <video> tag) — no YouTube iframe
 * embed involved at playback time at all. That embed approach kept
 * flashing YouTube's own captions/pause-button chrome for a frame or two
 * around every loop-back seek, which no player parameter or crossfade
 * trick fully eliminated; a real downloaded file has no player chrome to
 * flash in the first place.
 *
 * Resolving a direct, signed CDN URL for the video is done via yt-dlp (see
 * youtubeDownloadYtDlp.ts) — @distube/ytdl-core previously did this job but
 * fell increasingly behind YouTube's bot-check changes (a smaller,
 * less-resourced fork); yt-dlp is the actively-maintained, frequently-
 * patched industry-standard tool for exactly this. ffmpeg (bundled via
 * ffmpeg-static, no system install required) then trims and re-encodes,
 * reading directly from that CDN URL over HTTP — the clip is only ever a
 * few seconds, so this doesn't download the full source video, just the
 * byte range ffmpeg's input-side seek needs. */
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
    const { url, headers } = await resolveYoutubeFormatViaYtDlp(videoId);
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
    const message = err instanceof Error ? err.message : String(err);
    if (/sign in to confirm/i.test(message)) {
      // yt-dlp gets patched within days of YouTube changing something, but
      // it's still ultimately hitting the same bot-check surface — if it
      // still comes back with this specific error, fall back to actually
      // rendering the real watch page in a headless browser and
      // screen-recording it (see youtubeScreenRecord.ts), which presents a
      // real browser session rather than any kind of API call.
      return recordYoutubeClipViaBrowser(videoId, start, end);
    }
    return { ok: false, error: `Couldn't download/trim that clip: ${message}` };
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
