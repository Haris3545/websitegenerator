import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These ship native binaries (a headless Chromium build, ffmpeg) that the
  // bundler can't and shouldn't try to inline — used by
  // youtubeScreenRecord.ts's bot-check fallback, which needs a real browser
  // to render youtube.com rather than calling its data API directly.
  serverExternalPackages: ["@sparticuz/chromium-min", "puppeteer-core"],
};

export default nextConfig;
