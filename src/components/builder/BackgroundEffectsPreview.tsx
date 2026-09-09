"use client";

import { useId, useRef, useState } from "react";
import { grainTexture } from "@/lib/grainTexture";
import type { AestheticParams } from "@/lib/database.types";
import type { ThemeOverrides } from "@/lib/theme";
import { DEFAULT_THEME_OVERRIDES } from "@/lib/theme";
import { DEFAULT_AESTHETIC_PARAMS } from "@/lib/aesthetics";

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** A live preview of the dashboard background's own effects — zoom, contrast,
 * saturation, darkness overlay (theme_overrides) plus grain/tint/blur/
 * vignette/chromatic-aberration (aesthetic_params) — rendered directly next
 * to the sliders that control them. Those sliders used to have no preview
 * of their own at all: the only place that showed these effects live was
 * the Aesthetic section's dashboard mockup, further down the page, so
 * dragging a slider here meant scrolling away to see what it actually did.
 * Modeled on the password-page preview right above it in the Media section
 * (same pointer-drag-to-reposition pattern), just without that one's
 * tagline/title text, since this is purely about the background image
 * itself. */
export function BackgroundEffectsPreview({
  backgroundImageUrl,
  fontFamily,
  theme,
  onPositionChange,
  aesthetic,
}: {
  backgroundImageUrl: string | null;
  fontFamily: string;
  theme: ThemeOverrides;
  onPositionChange: (x: number, y: number) => void;
  aesthetic: AestheticParams;
}) {
  const t = { ...DEFAULT_THEME_OVERRIDES, ...theme };
  const a = { ...DEFAULT_AESTHETIC_PARAMS, ...aesthetic };
  const filterId = "bg-effects-chroma-" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
    moved: boolean;
  } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!backgroundImageUrl) return;
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: t.bg_position_x,
      startPosY: t.bg_position_y,
      moved: false,
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const ds = dragState.current;
    if (!ds) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    if (!ds.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      ds.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    if (!ds.moved) return;

    const containerRect = e.currentTarget.getBoundingClientRect();
    const imgRect = imgRef.current?.getBoundingClientRect();
    const overflowX = Math.max((imgRect?.width ?? containerRect.width) - containerRect.width, containerRect.width * 0.4);
    const overflowY = Math.max((imgRect?.height ?? containerRect.height) - containerRect.height, containerRect.height * 0.4);
    onPositionChange(
      Math.round(clamp(ds.startPosX - (dx / overflowX) * 100, 0, 100)),
      Math.round(clamp(ds.startPosY - (dy / overflowY) * 100, 0, 100))
    );
  }

  function handlePointerUp() {
    dragState.current = null;
    setDragging(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <filter id={filterId}>
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="red"
          />
          <feOffset in="red" dx={a.chromatic_aberration * 8} dy="0" result="redOffset" />
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="blue"
          />
          <feOffset in="blue" dx={a.chromatic_aberration * -8} dy="0" result="blueOffset" />
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="green"
          />
          <feBlend mode="screen" in="redOffset" in2="blueOffset" result="rb" />
          <feBlend mode="screen" in="rb" in2="green" />
        </filter>
      </svg>

      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`relative h-40 w-full touch-none select-none overflow-hidden rounded-lg lg:h-48 ${
          dragging ? "outline outline-2 outline-offset-2 outline-builder-accent" : ""
        } ${backgroundImageUrl ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""}`}
        style={{ backgroundColor: "#111", fontFamily: `"${fontFamily}", sans-serif` }}
      >
        {backgroundImageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={backgroundImageUrl}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover select-none"
              style={{
                filter: `blur(${a.blur * 12}px) contrast(${t.bg_contrast}) saturate(${t.bg_saturate}) url(#${filterId})`,
                objectPosition: `${t.bg_position_x}% ${t.bg_position_y}%`,
                transform: `scale(${t.bg_zoom})`,
              }}
            />
            <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${t.bg_scrim_opacity})` }} />
            <div className="absolute inset-0" style={{ backgroundColor: a.tint_color, opacity: a.tint_opacity * 0.65 }} />
            <div
              className="absolute inset-0"
              style={{ boxShadow: `inset 0 0 ${a.vignette * 260}px rgba(0,0,0,${a.vignette * 1.3})` }}
            />
            <div
              className="animate-grain absolute inset-0 mix-blend-overlay"
              style={{
                opacity: a.grain_intensity,
                backgroundImage: grainTexture(a.grain_monochrome),
                backgroundSize: "90px 90px",
              }}
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-white/30">
            Add a background above to preview these effects
          </div>
        )}
      </div>
    </div>
  );
}
