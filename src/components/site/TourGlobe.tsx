"use client";

import { useEffect, useRef, useState } from "react";
import dynamicImport from "next/dynamic";
import type { GlobeMethods } from "react-globe.gl";

// Loaded only when this component actually mounts (i.e. only on the
// Locations tab) — three.js is a sizable dependency, and every other tab
// should never pay for it.
const Globe = dynamicImport(() => import("react-globe.gl"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-xs text-white/30">
      Loading globe...
    </div>
  ),
});

export type TourGlobePoint = { lat: number; lng: number; label: string; color?: string };

const DEFAULT_GLOBE_HEIGHT = 420;

function isDarkColor(hex: string): boolean {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return true;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

export function TourGlobe({
  points,
  height = DEFAULT_GLOBE_HEIGHT,
  interactive = true,
}: {
  points: TourGlobePoint[];
  height?: number;
  /** false for the small corner overlay on the Locations map — spins on
   * its own (autoRotate) as ambient decoration without also fighting the
   * Leaflet map underneath for drag/scroll gestures. */
  interactive?: boolean;
}) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // These read external browser state once, at first client render — a
  // lazy initializer rather than an effect, since the inner Globe (loaded
  // with ssr:false) never renders anything on the server anyway, so there's
  // no server/client output to mismatch.
  const [accentColor] = useState(() => {
    if (typeof document === "undefined") return "#eab308";
    return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#eab308";
  });
  // The atmosphere glow used to just be the artist's accent color, which
  // defaults to gold/orange (#eab308) and read as a jarring orange halo
  // rather than a deliberate design choice. These sites are dark-themed
  // almost without exception, so a white glow reads as the "atmosphere"
  // effect it's meant to be; falling back to a dark tone covers the rare
  // light-background artist instead of a washed-out white-on-white glow.
  const [atmosphereGlowColor] = useState(() => {
    if (typeof document === "undefined") return "#ffffff";
    const secondary = getComputedStyle(document.documentElement).getPropertyValue("--secondary").trim();
    return isDarkColor(secondary) ? "#ffffff" : "#1e293b";
  });
  const [reducedMotion] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false
  );
  const [isVisible, setIsVisible] = useState(true);

  // Track container width for a responsive canvas, and visibility so the
  // render loop can fully stop (not just slow down) whenever the globe is
  // scrolled off-screen — the biggest lever for "don't lag the website".
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next) setWidth(next);
    });
    resizeObserver.observe(el);

    const visibilityObserver = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );
    visibilityObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    if (isVisible) {
      globe.resumeAnimation();
      const controls = globe.controls();
      controls.autoRotate = !reducedMotion;
    } else {
      globe.pauseAnimation();
    }
  }, [isVisible, reducedMotion]);

  return (
    <div
      ref={containerRef}
      className={interactive ? "overflow-hidden rounded-xl border border-white/10 bg-black/20" : "h-full w-full"}
      style={{ height }}
    >
      {width > 0 && (
        <Globe
          ref={globeRef}
          width={width}
          height={height}
          globeImageUrl="/globe/earth-vivid.jpg"
          backgroundColor="rgba(0,0,0,0)"
          showAtmosphere
          atmosphereColor={atmosphereGlowColor}
          atmosphereAltitude={0.18}
          pointsData={points}
          pointLat="lat"
          pointLng="lng"
          pointColor={(d) => (d as TourGlobePoint).color ?? accentColor}
          pointAltitude={0.012}
          pointRadius={0.4}
          pointLabel="label"
          animateIn={!reducedMotion}
          enablePointerInteraction={interactive}
          rendererConfig={{ antialias: true, alpha: true, powerPreference: "low-power" }}
          onGlobeReady={() => {
            const globe = globeRef.current;
            if (!globe) return;
            // Cap DPI so a 3x/4x-scale display doesn't render (and
            // re-render on every rotate frame) far more pixels than the
            // canvas is ever shown at.
            globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
            const controls = globe.controls();
            controls.autoRotate = !reducedMotion;
            controls.autoRotateSpeed = interactive ? 0.5 : 1.1;
            controls.enableDamping = true;
            controls.enableZoom = interactive;
          }}
        />
      )}
    </div>
  );
}
