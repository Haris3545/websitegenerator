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
      }
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
            className="w-full rounded-full border border-white/40 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-white hover:text-black disabled:opacity-50"
          >
            {isPending ? "Checking..." : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}
