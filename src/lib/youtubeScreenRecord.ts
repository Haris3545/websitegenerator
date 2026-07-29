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

// Same parsing youtubeDownload.ts does for the ytdl-core agent — duplicated
// rather than imported from there, since that file imports this one for its
// own fallback (importing back would be a cycle).
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

async function launchBrowser(): Promise<Browser> {
  const executablePath = await chromium.executablePath(CHROMIUM_PACK_URL);
  return puppeteer.launch({
    args: [...chromium.args, "--autoplay-policy=no-user-gesture-required"],
    defaultViewport: { width: RECORD_WIDTH, height: RECORD_HEIGHT },
    executablePath,
    headless: true,
  });
}

/** A fresh, logged-out browser session is exactly what shows YouTube's
 * "Sign in to confirm you're not a bot" wall in place of the real watch
 * page — the first attempt at this didn't carry YOUTUBE_COOKIE over into
 * the browser context at all, so of course it hit the same wall the direct
 * API path does. Loading the same session cookie here (already required
 * for the ytdl-core path — see youtubeDownload.ts) at least makes this a
 * real signed-in browser rather than an anonymous one. */
async function applySessionCookie(page: import("puppeteer-core").Page) {
  const raw = process.env.YOUTUBE_COOKIE;
  if (!raw) return;
  const cookies = parseCookieHeader(raw);
  if (!cookies.length) return;
  await page.setCookie(
    ...cookies.map((c) => ({ name: c.name, value: c.value, domain: ".youtube.com", path: "/", secure: true }))
  );
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
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // page.setCookie() falls back to the current page's own URL for any
    // cookie that doesn't specify one itself (see applySessionCookie) — on
    // a still-blank page that fallback has nothing to work with, which is
    // what threw "Invalid cookie fields" here. Navigating first so the page
    // actually has a real youtube.com URL, then reloading once the cookies
    // are in, is the standard fix (the first load happens logged-out
    // either way; the reload is what actually carries the session).
    await page.goto(watchUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await applySessionCookie(page);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });

    await dismissConsentDialog(page);
    await hidePlayerChrome(page);
    await page.waitForSelector("video", { timeout: 30_000 });

    // A single 6-second check for a skip button badly undercounted how long
    // pre-roll ads actually run: plenty aren't skippable until well past
    // that, or aren't skippable at all for their first 15-30s, and this
    // whole function only has ~60s total to work with (see maxDuration on
    // the artist builder pages) — so this polls the player's own
    // "ad-showing" state directly instead of gambling on one skip-button
    // check, clicking skip the moment one appears but otherwise just
    // waiting the ad out, up to AD_MAX_WAIT_MS.
    const AD_MAX_WAIT_MS = 20_000;
    const adDeadline = Date.now() + AD_MAX_WAIT_MS;
    while (Date.now() < adDeadline) {
      const adShowing = await page
        .evaluate(() => document.querySelector(".html5-video-player")?.classList.contains("ad-showing") ?? false)
        .catch(() => false);
      if (!adShowing) break;
      await page
        .click(".ytp-ad-skip-button, .ytp-skip-ad-button")
        .catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 750));
    }

    await page.evaluate((t: number) => {
      const v = document.querySelector("video") as HTMLVideoElement;
      v.muted = true;
      v.currentTime = t;
      void v.play();
    }, start);

    try {
      await page.waitForFunction(
        (t: number) => {
          const v = document.querySelector("video") as HTMLVideoElement | null;
          return !!v && v.currentTime >= t - 0.5 && !v.paused && v.readyState >= 3;
        },
        { timeout: 15_000 },
        start
      );
    } catch (waitErr) {
      // A bare "waiting failed" timeout gives no clue why — surface what
      // the player was actually doing (still on an ad? blocked by an
      // interstitial? genuinely stuck buffering?) so the next failure is
      // diagnosable instead of another guess.
      const diagnostics = await page
        .evaluate(() => {
          const v = document.querySelector("video") as HTMLVideoElement | null;
          const player = document.querySelector(".html5-video-player");
          return {
            title: document.title,
            bodySnippet: document.body.innerText.slice(0, 200).replace(/\s+/g, " "),
            adShowing: player?.classList.contains("ad-showing") ?? null,
            videoExists: !!v,
            paused: v?.paused ?? null,
            currentTime: v?.currentTime ?? null,
            readyState: v?.readyState ?? null,
            networkState: v?.networkState ?? null,
            errorCode: v?.error?.code ?? null,
          };
        })
        .catch(() => null);
      throw new Error(
        `Video never reached the requested timestamp: ${(waitErr as Error).message}. ${JSON.stringify(diagnostics)}`
      );
    }

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
