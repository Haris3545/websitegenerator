"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MusicAlbum } from "@/lib/database.types";

const COVER_GAP = 130; // px between cover centers at rest
const COVER_SIZE = 176; // px, the centered cover's width/height
const CLICK_THRESHOLD = 6; // px of movement below which a release counts as a click, not a drag

// A real swipe (quick flick) rarely travels the full COVER_GAP distance —
// without this, only a slow drag past half the gap would ever change the
// album, so a normal quick swipe just snapped back to where it started,
// reading as "swiping doesn't work."
const SWIPE_MAX_DURATION_MS = 300;
const SWIPE_MIN_DISTANCE_PX = 24;
const SWIPE_MIN_VELOCITY_PX_MS = 0.3;

function subscribeReducedMotion(callback: () => void) {
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}
function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function getReducedMotionServerSnapshot() {
  return false;
}

export function AlbumCoverFlow({ albums }: { albums: MusicAlbum[] }) {
  const [index, setIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  // useSyncExternalStore is the React-sanctioned way to read a value that
  // can differ between server and client render (here, an OS preference)
  // without a hydration mismatch — it renders the server snapshot through
  // hydration, then swaps to the real client value right after.
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Real DOM listeners on the container handle both dragging AND clicking a
  // visible side cover — a single source of truth for what the pointer did,
  // rather than splitting that between the container (drag) and each cover
  // button (its own onClick), which is what silently broke both: capturing
  // the pointer on the container suppresses the child button's native click.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let pointerId: number | null = null;
    let startX = 0;
    let downTime = 0;
    let moved = false;
    let clickedIndex: number | null = null;
    let wheelAccum = 0;
    let wheelSettleTimer: ReturnType<typeof setTimeout> | null = null;

    // A trackpad two-finger swipe (unlike a mouse-button drag or a touch
    // swipe) never fires pointerdown/move/up at all — it's a wheel event
    // with a horizontal delta. Without this, that gesture did nothing, so
    // the cover flow just resettled back on the album it started at,
    // reading as "scrolling snaps back to the first album." Only the
    // horizontal-dominant case is captured (and prevented from bubbling)
    // so a normal vertical mouse-wheel scroll of the page still works when
    // the cursor happens to be over the widget.
    function onWheel(e: WheelEvent) {
      if (albums.length <= 1) return;
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();

      wheelAccum += e.deltaX;
      setIsDragging(true);
      setDragOffset(wheelAccum);

      if (wheelSettleTimer) clearTimeout(wheelSettleTimer);
      wheelSettleTimer = setTimeout(() => {
        const moveBy = Math.round(wheelAccum / COVER_GAP);
        wheelAccum = 0;
        setIsDragging(false);
        setDragOffset(0);
        if (moveBy !== 0) {
          setIndex((i) => Math.max(0, Math.min(albums.length - 1, i + moveBy)));
        }
      }, 140);
    }

    function onPointerDown(e: PointerEvent) {
      pointerId = e.pointerId;
      startX = e.clientX;
      downTime = e.timeStamp;
      moved = false;
      const target = (e.target as HTMLElement).closest("[data-cover-index]");
      clickedIndex = target ? Number(target.getAttribute("data-cover-index")) : null;
      el!.setPointerCapture(e.pointerId);
      setIsDragging(true);
    }

    function onPointerMove(e: PointerEvent) {
      if (pointerId === null || e.pointerId !== pointerId) return;
      const delta = e.clientX - startX;
      if (Math.abs(delta) > CLICK_THRESHOLD) moved = true;
      // Negated: the release below already resolves a rightward drag to the
      // PREVIOUS album (content following the finger), but the live render
      // was fed the raw, un-negated delta — so covers visibly slid the
      // opposite way from where the drag was actually going to land,
      // reading as "the swipe is inverted."
      setDragOffset(-delta);
    }

    function onPointerUp(e: PointerEvent) {
      if (pointerId === null || e.pointerId !== pointerId) return;
      const delta = e.clientX - startX;
      const duration = e.timeStamp - downTime;
      pointerId = null;
      setIsDragging(false);
      setDragOffset(0);

      if (moved) {
        const distanceSteps = Math.round(-delta / COVER_GAP);
        const velocity = Math.abs(delta) / Math.max(duration, 1);
        const isQuickSwipe =
          duration < SWIPE_MAX_DURATION_MS &&
          Math.abs(delta) > SWIPE_MIN_DISTANCE_PX &&
          velocity > SWIPE_MIN_VELOCITY_PX_MS;
        const steps = distanceSteps !== 0 ? distanceSteps : isQuickSwipe ? (delta > 0 ? -1 : 1) : 0;
        if (steps !== 0) setIndex((i) => Math.max(0, Math.min(albums.length - 1, i + steps)));
      } else if (clickedIndex !== null) {
        setIndex(Math.max(0, Math.min(albums.length - 1, clickedIndex)));
      }
    }

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("wheel", onWheel);
      if (wheelSettleTimer) clearTimeout(wheelSettleTimer);
    };
  }, [albums.length]);

  function clamp(i: number) {
    return Math.max(0, Math.min(albums.length - 1, i));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") setIndex((i) => clamp(i - 1));
    if (e.key === "ArrowRight") setIndex((i) => clamp(i + 1));
  }

  const current = albums[index];

  return (
    <div>
      <div
        ref={containerRef}
        role="listbox"
        aria-label="Top albums"
        tabIndex={0}
        className="relative h-56 cursor-grab select-none outline-none active:cursor-grabbing sm:h-64"
        style={{ perspective: "1200px", touchAction: "none" }}
        onKeyDown={handleKeyDown}
      >
        {albums.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous album"
              onClick={() => setIndex((i) => clamp(i - 1))}
              disabled={index === 0}
              className="absolute left-0 top-1/2 z-50 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white/70 hover:text-white disabled:opacity-20"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next album"
              onClick={() => setIndex((i) => clamp(i + 1))}
              disabled={index === albums.length - 1}
              className="absolute right-0 top-1/2 z-50 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white/70 hover:text-white disabled:opacity-20"
            >
              ›
            </button>
          </>
        )}

        <div className="absolute inset-0 flex items-center justify-center">
          {albums.map((album, i) => {
            const rel = i - index - dragOffset / COVER_GAP;
            const abs = Math.abs(rel);
            if (abs > 4) return null;

            const translateX = rel * COVER_GAP;
            const rotateY = Math.max(-50, Math.min(50, rel * -50));
            const scale = Math.max(0.5, 1 - abs * 0.16);
            const opacity = Math.max(0, 1 - abs * 0.3);

            return (
              <div
                key={`${album.name}-${i}`}
                data-cover-index={i}
                role="option"
                aria-selected={i === index}
                className="absolute overflow-hidden rounded shadow-2xl shadow-black/60"
                style={{
                  width: COVER_SIZE,
                  height: COVER_SIZE,
                  transform: `translateX(${translateX}px) rotateY(${rotateY}deg) scale(${scale})`,
                  zIndex: 100 - Math.round(abs * 10),
                  opacity,
                  transition:
                    isDragging || reducedMotion ? "none" : "transform 0.35s ease, opacity 0.35s ease",
                }}
              >
                {album.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={album.artworkUrl}
                    alt={album.name}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-white/10 p-3 text-center text-xs text-white/40">
                    {album.name}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {current && (
        <div className="mt-4 text-center">
          <a
            href={current.url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold hover:underline"
          >
            {current.name}
          </a>
          {current.playcount !== null && (
            <p className="text-xs text-white/50">{current.playcount.toLocaleString()} scrobbles</p>
          )}
        </div>
      )}
    </div>
  );
}
