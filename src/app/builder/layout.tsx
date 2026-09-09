import type { Metadata } from "next";

// Scoped to /builder (covers both /builder/login and everything under the
// (app) group) rather than the root layout, since this is branding for the
// internal tool used to build dashboards — not something that should show
// up in the browser tab of an artist's own generated site, which has no
// title of its own yet and just inherits the root's default.
export const metadata: Metadata = {
  title: "Cultural Intelligence Designer",
  icons: {
    icon: [
      { url: "/vccp-media-logo.png", media: "(prefers-color-scheme: light)" },
      { url: "/vccp-media-logo-white.png", media: "(prefers-color-scheme: dark)" },
    ],
  },
};

export default function BuilderRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
