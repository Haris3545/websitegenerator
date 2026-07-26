"use client";

import { useState, useTransition } from "react";
import { verifyArtistAccess } from "@/app/s/[slug]/actions";
import { googleFontsCssUrl } from "@/lib/fonts";

/** Standard relative-luminance formula (0 black .. 1 white) — used to
 * decide whether the VCCP logo animation (black mark on a light backdrop
 * in its source file) needs inverting to read as a light mark on this
 * artist's chosen gate background, or looks right as-is. */
function isDarkColor(hex: string): boolean {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return true;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.5;
}

export function GateForm({
  slug,
  backgroundUrl,
  backgroundColor,
  accentColor,
  projectTitle,
  tagline,
  fontFamily,
}: {
  slug: string;
  backgroundUrl: string | null;
  backgroundColor: string;
  accentColor: string;
  projectTitle: string;
  tagline: string;
  fontFamily: string;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(backgroundUrl ?? "");
  const invertLogo = isDarkColor(backgroundColor);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await verifyArtistAccess(slug, password);
      if (!result.ok) {
        setError(
          result.error ??
            "That password isn't right — check with whoever shared this dashboard with you."
        );
      }
    });
  }

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 text-white"
      style={{ backgroundColor, fontFamily: `"${fontFamily}", sans-serif` }}
    >
      <link rel="stylesheet" href={googleFontsCssUrl(fontFamily)} />

      {backgroundUrl &&
        (isVideo ? (
          <video
            src={backgroundUrl}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backgroundUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ))}
      {backgroundUrl && <div className="absolute inset-0 bg-black/55" />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />

      <div className="relative z-10 flex w-full max-w-4xl flex-col items-center px-4 text-center">
        {/* Plays once and holds its final frame (no `loop`) — inverted
            against a dark gate background so the mark reads as light on
            dark rather than disappearing into it. */}
        <video
          src="/vccp-media-logo-animation.mp4"
          autoPlay
          muted
          playsInline
          className={`h-20 w-20 object-contain sm:h-24 sm:w-24 ${invertLogo ? "invert" : ""}`}
        />
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.35em] text-white/70">{tagline}</p>
        <h1 className="mt-3 text-4xl font-bold uppercase leading-none tracking-tight sm:text-6xl lg:text-7xl">
          {projectTitle}
        </h1>
        <div className="mt-6 h-px w-24" style={{ backgroundColor: accentColor }} />

        <form onSubmit={handleSubmit} className="mt-10 flex w-full max-w-sm flex-col gap-4">
          <input
            type="password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-full border border-white/30 bg-black/30 px-6 py-3 text-center text-sm tracking-wide text-white placeholder-white/40 backdrop-blur-sm focus:border-white/60 focus:outline-none"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-full border border-white/40 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-white transition-colors hover:bg-white hover:text-black disabled:opacity-50"
          >
            {isPending ? "Checking..." : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}
