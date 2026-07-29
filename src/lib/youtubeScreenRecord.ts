import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import chromium from "@sparticuz/chromium-min";
import puppeteer, { type Browser } from "puppeteer-core";
import ffmpegPath from "ffmpeg-static";

// Must be bumped together with the @sparticuz/chromium-min version in
// package.json — this points at the exact matching pre-built Chromium
// binary pack (chromium-min ships without one, to stay under Vercel's
// function bundle size limit, and downloads it from here at cold start
// instead). See https://github.com/Sparticuz/chromium/releases — the
// asset name always includes an architecture suffix (x64/arm64), which a
// bare "-pack.tar" (no suffix) 404s on; Vercel's Node.js Functions run x64.
const CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

const RECORD_WIDTH = 960;
const RECORD_HEIGHT = 540;
// CDP screencast frames arrive whenever the page actually repaints, not on
// a strict clock — this is the framerate ffmpeg is told to *assume* between
// whatever frames actually show up, which is the same approximation every
// screen-recording tool built on this technique makes. Fine for a short,
// muted background loop; not frame-accurate.
const ASSUMED_FPS = 20;

type ScreencastFrameEvent = { data: string; sessionId: number };

async function launchBrowser(): Promise<Browser> {
  const executablePath = await chromium.executablePath(CHROMIUM_PACK_URL);
  return puppeteer.launch({
    args: [...chromium.args, "--autoplay-policy=no-user-gesture-required"],
    defaultViewport: { width: RECORD_WIDTH, height: RECORD_HEIGHT },
    executablePath,
    headless: true,
  });
}

/** Clicks the first button whose text matches one of the given phrases —
 * used for YouTube's cookie-consent wall, whose exact button text varies by
 * region/language. A no-op (not an error) if none show up, since most
 * requests never see one at all. */
async function dismissConsentDialog(page: import("puppeteer-core").Page) {
  await page
    .evaluate((phrases: string[]) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const match = buttons.find((b) =>
        phrases.some((p) => b.textContent?.trim().toLowerCase().includes(p))
      );
      (match as HTMLButtonElement | undefined)?.click();
    }, ["reject all", "accept all", "i agree"])
    .catch(() => {});
}

/** Hides every piece of YouTube's own player chrome (captions, the title
 * bar, the pause/play button, end-screen suggestions, the watermark) via
 * CSS rather than trying to catch and dismiss each one individually — the
 * same goal YoutubeClipField's overscan-crop trick already solves for the
 * old embed-player approach, but simpler here since this is a real page we
 * fully control via injected styles rather than an iframe's isolated
 * document. Also stretches the video element to fill the recorded
 * viewport, so the output is a clean, cropped video with nothing else. */
async function hidePlayerChrome(page: import("puppeteer-core").Page) {
  await page.addStyleTag({
    content: `
      .ytp-chrome-bottom, .ytp-chrome-top, .ytp-gradient-bottom, .ytp-gradient-top,
      .ytp-pause-overlay, .ytp-caption-window-container, .ytp-ce-element,
      .ytp-cued-thumbnail-overlay, .ytp-large-play-button, .ytp-title,
      .ytp-watermark, .ytp-context-menu, .ytp-popup, .ytp-spinner,
      .ytp-endscreen-content, tp-yt-paper-dialog, ytd-consent-bump-v2-lightbox {
        display: none !important;
        opacity: 0 !important;
      }
      html, body { margin: 0 !important; overflow: hidden !important; background: #000 !important; }
      #movie_player, .html5-video-player { width: 100vw !important; height: 100vh !important; }
      video { width: 100% !important; height: 100% !important; object-fit: cover !important; }
    `,
  });
}

/** Same fallback used by downloadYoutubeClip when the direct API extraction
 * gets blocked as a bot request (see youtubeDownload.ts) — instead of
 * asking YouTube's data API for a direct CDN stream URL, this actually
 * renders the real youtube.com watch page in a headless browser (with
 * its own bundled Chromium, since Vercel's runtime doesn't ship one) and
 * screen-records the video element playing, muted, for the requested
 * window. Slower (it takes at least as long as the clip's own duration,
 * in real time, plus page-load/consent/ad overhead) and heavier (a whole
 * browser has to cold-start), but presents a real, JS-executing browser
 * session rather than a bare API call — which is what YouTube's stricter
 * bot checks increasingly require regardless of a valid session cookie. */
export async function recordYoutubeClipViaBrowser(
  videoId: string,
  start: number,
  end: number
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  const duration = end - start;
  if (!(duration > 0)) return { ok: false, error: "Clip must have a positive duration." };
  if (!ffmpegPath) return { ok: false, error: "ffmpeg isn't available in this environment." };

  let browser: Browser | null = null;
  let tmpDir: string | null = null;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    await dismissConsentDialog(page);
    await hidePlayerChrome(page);
    await page.waitForSelector("video", { timeout: 30_000 });

    // Skip a pre-roll ad if one shows up — its own video element would
    // otherwise get recorded instead of the real one.
    try {
      const skipSelector = ".ytp-ad-skip-button, .ytp-skip-ad-button";
      await page.waitForSelector(skipSelector, { timeout: 6_000 });
      await page.click(skipSelector);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    } catch {}

    await page.evaluate((t: number) => {
      const v = document.querySelector("video") as HTMLVideoElement;
      v.muted = true;
      v.currentTime = t;
      void v.play();
    }, start);

    await page.waitForFunction(
      (t: number) => {
        const v = document.querySelector("video") as HTMLVideoElement | null;
        return !!v && v.currentTime >= t - 0.5 && !v.paused && v.readyState >= 3;
      },
      { timeout: 20_000 },
      start
    );

    tmpDir = await mkdtemp(path.join(tmpdir(), "yt-rec-"));
    const outputPath = path.join(tmpDir, "clip.mp4");

    const ffmpegProc = spawn(
      ffmpegPath,
      [
        "-f",
        "mjpeg",
        "-framerate",
        String(ASSUMED_FPS),
        "-i",
        "pipe:0",
        "-t",
        String(duration),
        "-vf",
        "scale='min(1280,iw)':-2",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-y",
        outputPath,
      ],
      { stdio: ["pipe", "ignore", "pipe"] }
    );
    let ffmpegStderr = "";
    ffmpegProc.stderr?.on("data", (chunk: Buffer) => {
      ffmpegStderr += chunk.toString();
    });
    const ffmpegExit = new Promise<number | null>((resolve) => {
      ffmpegProc.on("close", resolve);
    });

    const client = await page.createCDPSession();
    await client.send("Page.startScreencast", {
      format: "jpeg",
      quality: 80,
      maxWidth: RECORD_WIDTH,
      maxHeight: RECORD_HEIGHT,
      everyNthFrame: 1,
    });
    client.on("Page.screencastFrame", (event: ScreencastFrameEvent) => {
      if (!ffmpegProc.stdin.destroyed) ffmpegProc.stdin.write(Buffer.from(event.data, "base64"));
      client.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {});
    });

    await new Promise((resolve) => setTimeout(resolve, duration * 1000 + 300));

    await client.send("Page.stopScreencast").catch(() => {});
    ffmpegProc.stdin.end();
    const exitCode = await ffmpegExit;
    if (exitCode !== 0) {
      throw new Error(`ffmpeg exited with code ${exitCode}: ${ffmpegStderr.slice(-2000)}`);
    }

    const buffer = await readFile(outputPath);
    return { ok: true, buffer };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Screen-recording fallback also failed: ${message}` };
  } finally {
    await browser?.close().catch(() => {});
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
