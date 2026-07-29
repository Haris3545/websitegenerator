import fs from "node:fs";
import path from "node:path";

/** scripts/download-yt-dlp.js fetches yt-dlp's standalone Linux binary here
 * at install time (postinstall) — the same "binary lives next to the code,
 * not npm-published" pattern ffmpeg-static already uses in this project,
 * just done by hand since there's no actively-maintained npm wrapper worth
 * depending on for this. Returns null (rather than throwing) when missing
 * so callers can report a clear, specific error instead of an ENOENT. */
export function resolveYtDlpPath(): string | null {
  const p = path.join(process.cwd(), "vendor", "yt-dlp", "yt-dlp");
  return fs.existsSync(p) ? p : null;
}
