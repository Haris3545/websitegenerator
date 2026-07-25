"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import type { MusicAlbum } from "@/lib/database.types";

const COVER_GAP = 130; // px between cover centers at rest
const COVER_SIZE = 176; // px, the centered cover's width/height

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
  const dragStartX = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  function clamp(i: number) {
    return Math.max(0, Math.min(albums.length - 1, i));
  }

  function handlePointerDown(e: React.PointerEvent) {
    setIsDragging(true);
    dragStartX.current = e.clientX;
    containerRef.current?.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!isDragging) return;
    setDragOffset(e.clientX - dragStartX.current);
  }

  function endDrag() {
    if (!isDragging) return;
    setIsDragging(false);
    setIndex((i) => clamp(i + Math.round(-dragOffset / COVER_GAP)));
    setDragOffset(0);
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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
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
              <button
                key={`${album.name}-${i}`}
                type="button"
                role="option"
                aria-selected={i === index}
                onClick={() => setIndex(i)}
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
              </button>
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
