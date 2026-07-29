import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These ship native binaries (a headless Chromium build, ffmpeg) that the
  // bundler can't and shouldn't try to inline — used by
  // youtubeScreenRecord.ts's bot-check fallback, which needs a real browser
  // to render youtube.com rather than calling its data API directly.
  serverExternalPackages: ["@sparticuz/chromium-min", "puppeteer-core"],
  // vendor/yt-dlp/yt-dlp (downloaded by scripts/download-yt-dlp.js's
  // postinstall hook — see ytDlpPath.ts) is read from disk via execFile
  // rather than require()'d, so Next's build-time file tracing has no
  // static import to follow and would otherwise leave it out of the
  // deployed function entirely. These are the only two routes that ever
  // call downloadYoutubeClip (see BackgroundMediaField.tsx).
  outputFileTracingIncludes: {
    "/builder/artists/new": ["./vendor/yt-dlp/**/*"],
    "/builder/artists/[id]": ["./vendor/yt-dlp/**/*"],
  },
};

export default nextConfig;
