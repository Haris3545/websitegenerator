"use client";

import { useEffect, useRef, useState } from "react";
import dynamicImport from "next/dynamic";
import * as THREE from "three";
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

// Shrunk from an earlier, chunkier pass (head 6 / needle 11) — at this
// globe's scale (radius 100 units ~= Earth's 6371km, so 1 unit ~= 64km),
// even two cities 50-100km apart sit only ~1-1.5 units apart on the
// surface, far closer together than a 12-unit-diameter head can avoid
// overlapping. Shrinking the geometry is the main lever that actually
// reduces overlap for a tight cluster like nearby UK cities; the tilt/jitter
// below help the remaining unavoidable overlap read as "layered" rather
// than "glitched" instead of eliminating it outright.
const PIN_HEAD_RADIUS = 3.6;
const PIN_NEEDLE_LENGTH = 7;
const PIN_NEEDLE_RADIUS = 1.3;

// How far a pin's farthest point (the far edge of its head) reaches beyond
// its own contact point on the surface — used both to fit the camera so
// pins never get clipped (see onGlobeReady) and, implicitly, to reason
// about the tilt below. The *1.15 leaves headroom for PIN_TILT_MAX_RAD
// tipping a pin slightly sideways, which pushes its silhouette a bit
// further than the pure-radial reach this otherwise measures.
const PIN_REACH = (PIN_NEEDLE_LENGTH + PIN_HEAD_RADIUS * 1.35) * 1.15;

// Nearby pins (e.g. UK cities a few dozen km apart) sit close enough
// together at this globe's scale that standing every pin perfectly
// parallel (straight out from the surface) makes their heads visually mesh
// into one blob where they cluster. Leaning each one a few degrees off
// pure-radial, by a fixed amount derived from the point's own lat/lng/label
// rather than random per render, fans clustered pins apart while keeping
// each pin's own tilt stable across re-renders.
const PIN_TILT_MAX_RAD = THREE.MathUtils.degToRad(28);

// A small deterministic altitude jitter (in units of globe radius) on top
// of the base contact altitude — nearby pins in a tight cluster get
// staggered slightly along their own "pop out" direction as well as tilted,
// so a cluster reads as several layered pins at slightly different heights
// rather than a single coincident blob.
const PIN_ALTITUDE_BASE = 0.001;
const PIN_ALTITUDE_JITTER = 0.006;

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (Math.imul(hash, 31) + seed.charCodeAt(i)) | 0;
  return hash >>> 0;
}

// A real 3D pushpin mesh (not a DOM overlay), planted on the globe's
// surface at each point's lat/lng — a metallic needle tip touching the
// surface with a glossy, coloured, rounded head above it, matching a real
// thumbtack. Building this as actual geometry in the WebGL scene (rather
// than the previous flat HTML div positioned over the canvas) is what lets
// the head genuinely extend past the sphere's silhouette instead of being
// clipped by the corner overlay's circular CSS mask, which only clips the
// canvas element itself, not content the canvas renders inside its bounds.
function buildPinObject(color: string, tiltSeed: string): THREE.Group {
  const group = new THREE.Group();

  // Cone apex (the point) starts at local z=0 — the globe surface contact
  // point three-globe positions this group at — and the wide base sits at
  // z=PIN_NEEDLE_LENGTH, flush against the head. objectFacesSurface (on by
  // default for the objects layer) rotates the whole group so local +z
  // always points radially outward from the globe's center at this pin's
  // lat/lng, so the same local geometry works at any point on the sphere.
  const needleGeom = new THREE.ConeGeometry(PIN_NEEDLE_RADIUS, PIN_NEEDLE_LENGTH, 16);
  needleGeom.rotateX(-Math.PI / 2);
  needleGeom.translate(0, 0, PIN_NEEDLE_LENGTH / 2);
  const needle = new THREE.Mesh(
    needleGeom,
    new THREE.MeshStandardMaterial({ color: 0xd6d9dd, metalness: 0.9, roughness: 0.25 })
  );

  const headGeom = new THREE.SphereGeometry(PIN_HEAD_RADIUS, 24, 16);
  headGeom.translate(0, 0, PIN_NEEDLE_LENGTH + PIN_HEAD_RADIUS * 0.35);
  const head = new THREE.Mesh(
    headGeom,
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.22,
      metalness: 0.12,
      // A faint self-glow in the pin's own colour so it still reads as
      // that colour on the far side of the globe's fixed directional
      // light as the globe auto-rotates, rather than going flat/dark —
      // the roughness/metalness above is what gives the glossy specular
      // highlight while the light does hit it.
      emissive: color,
      emissiveIntensity: 0.16,
    })
  );

  group.add(needle, head);

  // Rotating the whole group around its own origin (the needle tip, which
  // every geometry above was translated to sit at) leans the pin sideways
  // while keeping that tip anchored exactly on the surface contact point.
  const hash = hashSeed(tiltSeed);
  const angle = ((hash % 360) / 360) * Math.PI * 2;
  group.rotation.set(Math.cos(angle) * PIN_TILT_MAX_RAD, Math.sin(angle) * PIN_TILT_MAX_RAD, 0);

  return group;
}

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
          objectsData={points}
          objectLat="lat"
          objectLng="lng"
          objectAltitude={(d) => {
            const point = d as TourGlobePoint;
            const hash = hashSeed(`${point.lat},${point.lng},${point.label}`);
            return PIN_ALTITUDE_BASE + (hash % 1000) / 1000 * PIN_ALTITUDE_JITTER;
          }}
          objectThreeObject={(d) => {
            const point = d as TourGlobePoint;
            return buildPinObject(point.color ?? accentColor, `${point.lat},${point.lng},${point.label}`);
          }}
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

            // globe.gl's own default camera distance (altitude 2.5 globe
            // radii) leaves a visible gap around the sphere inside its
            // frame. Zoom in until the *pins' own reach* — not just the bare
            // sphere — touches the (square) frame's edges instead: a sphere
            // of radius R viewed from distance d has angular radius
            // asin(R/d), so the distance at which that angle equals half the
            // camera's vertical FOV is exactly the distance where a sphere
            // of that radius fills the frame edge-to-edge. Fitting to the
            // bare globe radius alone (as an earlier version of this did)
            // put the sphere's silhouette exactly on the frame's edge, which
            // guaranteed any pin popping out past the surface near the
            // visible limb got clipped by the corner overlay's circular
            // mask the moment it went even slightly past the sphere. Fitting
            // to globe-radius + PIN_REACH instead leaves the bare sphere
            // just shy of the edge, with exactly enough of a margin for the
            // tallest pin to pop out into without ever touching the mask.
            // react-globe.gl's exposed camera() is typed as the generic
            // THREE.Camera base, but globe.gl always constructs its scene
            // camera as a PerspectiveCamera under the hood.
            const camera = globe.camera() as THREE.PerspectiveCamera;
            const halfFovRad = THREE.MathUtils.degToRad(camera.fov / 2);
            const globeRadius = globe.getGlobeRadius();
            const effectiveRadius = globeRadius + PIN_REACH;
            const fitAltitude = effectiveRadius / (globeRadius * Math.sin(halfFovRad)) - 1;
            // OrbitControls' autoRotate only changes the camera's azimuth
            // (longitude), not its polar angle (latitude) — so whatever
            // latitude the camera starts at is the one it keeps sweeping at
            // forever. Left at the default (the equator), the spin mostly
            // shows open ocean; centering on ~44°N instead — roughly midway
            // between the UK (~54°N) and the continental US (~40°N) — puts
            // both landmasses in that sweep as it rotates through longitudes.
            globe.pointOfView({ lat: 44, lng: -30, altitude: fitAltitude }, 0);

            const controls = globe.controls();
            controls.autoRotate = !reducedMotion;
            controls.autoRotateSpeed = interactive ? 0.5 : 1.1;
            controls.enableDamping = true;
            controls.enableZoom = interactive;
            // Zooming in further is still allowed (down to globe.gl's own
            // near-surface minDistance), but zooming back out past this
            // fitted distance would just reintroduce the gap around the
            // sphere the frame is meant to be filled by, so cap it here.
            controls.maxDistance = camera.position.length();
          }}
        />
      )}
    </div>
  );
}
