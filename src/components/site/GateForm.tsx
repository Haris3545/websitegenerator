"use client";

import { useState, useTransition } from "react";
import { verifyArtistAccess } from "@/app/s/[slug]/actions";
import { googleFontsCssUrl } from "@/lib/fonts";
import { grainTexture } from "@/lib/grainTexture";
import { AutoFitHeading } from "@/components/site/AutoFitHeading";

// Fixed fallback fill for the rare gate with no photo/video background set
// at all — there's no per-artist secondary colour anymore, so this is just
// a plain neutral rather than anything configurable.
const FALLBACK_BACKGROUND = "#0a0a0a";

// Same pair the builder login page uses (see EyeIcon/EyeOffIcon in
// app/builder/login/page.tsx) — kept local here rather than shared since
// each site only ever needs its own copy and the two pickers already style
// them completely differently (light form vs. this dark gate).
function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth={1.6} />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <path
        d="M2 12s3.5-7 10-7c1.9 0 3.5.5 4.8 1.2M22 12s-1.2 2.4-3.5 4.3M9.9 9.9a2.75 2.75 0 0 0 3.9 3.9"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4.5 4.5 19.5 19.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

export function GateForm({
  slug,
  backgroundUrl,
  accentColor,
  projectTitle,
  tagline,
  fontFamily,
  scrimOpacity = 0.55,
  grainIntensity = 0,
  grainMonochrome = false,
  bgPositionX = 50,
  bgPositionY = 50,
  bgZoom = 1,
}: {
  slug: string;
  backgroundUrl: string | null;
  accentColor: string;
  projectTitle: string;
  tagline: string;
  fontFamily: string;
  scrimOpacity?: number;
  grainIntensity?: number;
  grainMonochrome?: boolean;
  bgPositionX?: number;
  bgPositionY?: number;
  bgZoom?: number;
}) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(backgroundUrl ?? "");

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
        return;
      }
      // A real navigation (not router.push) — the dashboard's own first
      // render does real data-fetching that can take a few seconds, and a
      // hard navigation shows the browser's own loading state for that
      // instead of leaving this button stuck on "Checking…" the whole time.
      window.location.href = `/s/${slug}`;
    });
  }

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 text-white"
      style={{ backgroundColor: FALLBACK_BACKGROUND, fontFamily: `"${fontFamily}", sans-serif` }}
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
            style={{ objectPosition: `${bgPositionX}% ${bgPositionY}%`, transform: `scale(${bgZoom})` }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backgroundUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: `${bgPositionX}% ${bgPositionY}%`, transform: `scale(${bgZoom})` }}
          />
        ))}
      {backgroundUrl && (
        <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${scrimOpacity})` }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />
      {grainIntensity > 0 && (
        <div
          className="animate-grain absolute inset-0 mix-blend-overlay"
          style={{
            opacity: grainIntensity,
            backgroundImage: grainTexture(grainMonochrome),
            backgroundSize: "90px 90px",
          }}
        />
      )}

      <div className="relative z-10 mt-16 flex w-full max-w-4xl flex-col items-center px-4 text-center sm:mt-24">
        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-white/70 sm:text-base">{tagline}</p>
        <AutoFitHeading
          maxFontSizePx={112}
          minFontSizePx={22}
          className="mt-4 font-bold uppercase leading-none tracking-tight"
        >
          {projectTitle}
        </AutoFitHeading>
        <div className="mt-6 h-px w-24" style={{ backgroundColor: accentColor }} />

        <form onSubmit={handleSubmit} className="mt-10 flex w-full max-w-sm flex-col gap-4">
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-full border border-white/30 bg-black/30 px-6 py-3 text-center text-sm tracking-wide text-white placeholder-white/40 backdrop-blur-sm focus:border-white/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-white/50 transition-colors hover:text-white/90"
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-full border border-white/40 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-white hover:text-black disabled:opacity-50"
          >
            {isPending ? "Checking..." : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}
