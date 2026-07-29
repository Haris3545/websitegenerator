import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveYtDlpPath } from "@/lib/ytDlpPath";

const execFileAsync = promisify(execFile);

const MAX_HEIGHT = 1080; // matches youtubeDownload.ts's own cap — muted background loops never need more.

type YtDlpFormat = {
  url?: string;
  height?: number;
  vcodec?: string;
  acodec?: string;
  http_headers?: Record<string, string>;
};

type YtDlpInfo = { formats?: YtDlpFormat[] };

/** Mirrors youtubeDownload.ts's own pickFormat: prefer video-only streams
 * (no reason to pull audio down for something only ever played back muted),
 * capped at MAX_HEIGHT, falling back to whatever's available if nothing
 * qualifies. */
function pickFormat(formats: YtDlpFormat[]): YtDlpFormat {
  const videoOnly = formats.filter((f) => f.vcodec && f.vcodec !== "none" && (!f.acodec || f.acodec === "none"));
  const candidates = videoOnly.length ? videoOnly : formats.filter((f) => f.vcodec && f.vcodec !== "none");
  if (!candidates.length) throw new Error("This video doesn't have any usable video stream.");

  const withinCap = candidates.filter((f) => !f.height || f.height <= MAX_HEIGHT);
  const pool = withinCap.length ? withinCap : candidates;
  return pool.reduce((best, f) => ((f.height ?? 0) > (best.height ?? 0) ? f : best));
}

/** Resolves a direct, signed CDN stream URL (plus whatever headers that URL
 * needs) via yt-dlp instead of @distube/ytdl-core — see
 * scripts/download-yt-dlp.js and package.json's postinstall hook for how
 * the binary gets here. yt-dlp is the actively-maintained, frequently-
 * patched industry-standard extractor; ytdl-core is a much smaller fork
 * that fell behind YouTube's changes, which is why every request started
 * failing with a bot-check error (see youtubeDownload.ts's own history of
 * fixes that didn't stick). This only resolves the format — the existing
 * ffmpeg trim/re-encode step in youtubeDownload.ts is unchanged. */
export async function resolveYoutubeFormatViaYtDlp(
  videoId: string
): Promise<{ url: string; headers: Record<string, string> }> {
  const ytDlpPath = resolveYtDlpPath();
  if (!ytDlpPath) {
    throw new Error("yt-dlp isn't installed in this environment — scripts/download-yt-dlp.js didn't run at build time.");
  }

  const cookieHeader = process.env.YOUTUBE_COOKIE;
  const args = [
    "-j",
    "--no-warnings",
    "--no-playlist",
    // Many formats now come back tagged as needing a "PO token" (a
    // cryptographic proof-of-origin challenge YouTube added, normally only
    // solvable by actually running its BotGuard JS in a real browser) and
    // yt-dlp drops them by default rather than hand back a stream URL it
    // suspects will get throttled or rejected. There's no practical way to
    // solve that challenge from inside a single stateless serverless
    // invocation (the community's real fix — bgutil-ytdlp-pot-provider —
    // needs a long-running companion process alongside yt-dlp, which
    // doesn't fit this environment). This flag is yt-dlp's own built-in
    // escape hatch: return those formats anyway and let us try them, since
    // "might be throttled" still beats "no fallback".
    "--extractor-args",
    "youtube:formats=missing_pot",
    ...(cookieHeader ? ["--add-header", `Cookie:${cookieHeader}`] : []),
    `https://www.youtube.com/watch?v=${videoId}`,
  ];

  const { stdout } = await execFileAsync(ytDlpPath, args, { timeout: 30_000, maxBuffer: 1024 * 1024 * 32 });

  const info: YtDlpInfo = JSON.parse(stdout);
  const formats = info.formats ?? [];
  if (!formats.length) throw new Error("yt-dlp returned no usable formats for this video.");

  const format = pickFormat(formats);
  if (!format.url) throw new Error("Couldn't resolve a downloadable stream for that video.");

  return { url: format.url, headers: format.http_headers ?? {} };
}
