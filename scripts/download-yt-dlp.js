"use strict";

// Downloads yt-dlp's standalone Linux binary (no Python required — a
// self-contained PyInstaller build) at install time, the same way
// ffmpeg-static's own postinstall script fetches its binary — so it's
// available both locally and in Vercel's build step, and gets bundled into
// the deployed function alongside everything else. See
// src/lib/youtubeDownloadYtDlp.ts for why yt-dlp replaced @distube/ytdl-core
// as the primary extraction path: yt-dlp is the actively-maintained,
// frequently-patched industry-standard tool, where ytdl-core is a smaller
// fork that fell behind YouTube's changes.

const fs = require("fs");
const path = require("path");
const https = require("https");

const DEST_DIR = path.join(__dirname, "..", "vendor", "yt-dlp");
const DEST_PATH = path.join(DEST_DIR, "yt-dlp");
const DOWNLOAD_URL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

function download(url, dest, redirectsLeft) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            reject(new Error("Too many redirects downloading yt-dlp"));
            return;
          }
          resolve(download(res.headers.location, dest, redirectsLeft - 1));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Unexpected status ${res.statusCode} downloading ${url}`));
          return;
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve(undefined)));
        file.on("error", reject);
      })
      .on("error", reject);
  });
}

async function main() {
  if (fs.existsSync(DEST_PATH)) {
    console.log("yt-dlp binary already present, skipping download.");
    return;
  }
  fs.mkdirSync(DEST_DIR, { recursive: true });
  console.log(`Downloading yt-dlp from ${DOWNLOAD_URL} ...`);
  try {
    await download(DOWNLOAD_URL, DEST_PATH, 5);
    fs.chmodSync(DEST_PATH, 0o755);
    console.log(`yt-dlp installed at ${DEST_PATH}`);
  } catch (err) {
    // Don't fail the whole install/build over a network hiccup fetching
    // this — youtubeDownloadYtDlp.ts checks for the binary's presence and
    // reports a clear error (rather than crashing) if it's missing, so a
    // failed fetch here just means clip downloads report that error
    // instead of silently breaking the entire build.
    fs.rmSync(DEST_PATH, { force: true });
    console.warn(`Couldn't download yt-dlp binary (clip downloads will report this): ${err.message}`);
  }
}

main();
