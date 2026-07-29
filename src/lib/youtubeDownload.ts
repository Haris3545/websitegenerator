import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ytdl from "@distube/ytdl-core";
import ffmpegPath from "ffmpeg-static";
import { recordYoutubeClipViaBrowser } from "@/lib/youtubeScreenRecord";
import { resolveYoutubeFormatViaYtDlp } from "@/lib/youtubeDownloadYtDlp";
import { resolveYoutubeFormatViaPiped } from "@/lib/youtubeDownloadPiped";
import { resolveYoutubeFormatViaInvidious } from "@/lib/youtubeDownloadInvidious";
import { resolveYoutubeFormatViaCobalt } from "@/lib/youtubeDownloadCobalt";

const execFileAsync = promisify(execFile);

const MAX_CLIP_SECONDS = 12; // small buffer over the 10s the builder's trimmer enforces
// A googlevideo.com URL rejects requests that don't look like they came
// from a real browser — used as a fallback only when yt-dlp doesn't hand
// back its own headers for a format (it normally does).
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** yt-dlp, Piped, Invidious, and Cobalt all do the same job — resolve a
 * direct, playable stream URL — via completely different infrastructure:
 * yt-dlp runs here, on this deployment's own IP; the other three's public
 * instances (three separately-run open-source projects) resolve it on
 * theirs instead. yt-dlp goes first since it's a single fast local call
 * with no network hop to a third party; the other three then race each
 * other (Promise.any across every instance of all three, not one project
 * after another) as the fallback that sidesteps whatever's blocking direct
 * extraction from this IP entirely — racing rather than trying one whole
 * project before the next matters given how often individual public
 * instances turn out to be down. */
async function resolveFormat(videoId: string): Promise<{ url: string; headers: Record<string, string> }> {
  try {
    return await resolveYoutubeFormatViaYtDlp(videoId);
  } catch (ytDlpErr) {
    try {
      return await Promise.any([
        resolveYoutubeFormatViaPiped(videoId),
        resolveYoutubeFormatViaInvidious(videoId),
        resolveYoutubeFormatViaCobalt(videoId),
      ]);
    } catch (aggregate) {
      const ytDlpMsg = ytDlpErr instanceof Error ? ytDlpErr.message : String(ytDlpErr);
      const thirdPartyMsg =
        aggregate instanceof AggregateError
          ? aggregate.errors.map((e) => (e instanceof Error ? e.message : String(e))).join(" | ")
          : String(aggregate);
      throw new Error(`yt-dlp: ${ytDlpMsg} | ${thirdPartyMsg}`);
    }
  }
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
    const { url, headers } = await resolveFormat(videoId);
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
    // Both resolveFormat's own methods (yt-dlp, then Piped) already failed
    // by this point, or ffmpeg itself choked on whatever URL one of them
    // did resolve — either way, the last resort is actually rendering the
    // real watch page in a headless browser and screen-recording it (see
    // youtubeScreenRecord.ts), a fundamentally different technique from
    // either extraction method above. If that also fails, its own error
    // gets appended so nothing upstream is lost.
    const screenRecordResult = await recordYoutubeClipViaBrowser(videoId, start, end);
    if (screenRecordResult.ok) return screenRecordResult;
    return {
      ok: false,
      error: `Couldn't download/trim that clip. ${message} | ${screenRecordResult.error}`,
    };
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
