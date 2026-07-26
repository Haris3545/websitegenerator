"use client";

import type { BoardItem } from "@/lib/database.types";

// A stable "messy stack" tilt sequence, cycled by stack position, rather
// than a random angle per card — keeps the tilt consistent between renders
// instead of jittering every time the list re-sorts.
const TILT_SEQUENCE = [-4, 3, -6, 5];

export function tiltFor(index: number) {
  return TILT_SEQUENCE[index % TILT_SEQUENCE.length];
}

const cardFaceStyle = {
  borderRadius: "var(--card-radius, 16px)",
  border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
} as const;

function CardFront({ item }: { item: BoardItem }) {
  return (
    <div className="relative h-full w-full">
      {item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image_url} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-white/5 text-sm text-white/30">
          No image yet
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-5 pt-20">
        <h3 className="text-left text-xl font-bold leading-tight text-white drop-shadow-sm">{item.title}</h3>
      </div>
    </div>
  );
}

/** A non-interactive card peeking out from behind the top of the stack —
 * just the front face, tilted per its depth, so the stack reads as a messy
 * pile of ideas rather than a single flat card. */
export function FillerCard({ item, index }: { item: BoardItem; index: number }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden shadow-xl shadow-black/40"
      style={{
        ...cardFaceStyle,
        backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.5))",
        transform: `translateY(${index * 10}px) scale(${1 - index * 0.035}) rotate(${tiltFor(index)}deg)`,
        zIndex: 10 - index,
      }}
    >
      <CardFront item={item} />
    </div>
  );
}

export function TopCard({
  item,
  flipped,
  offset,
  isDragging,
  showFlipHint,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onTap,
  onEdit,
  onDelete,
}: {
  item: BoardItem;
  flipped: boolean;
  offset: { x: number; y: number };
  isDragging: boolean;
  showFlipHint: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
  onTap: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const rotate = flipped ? offset.x / 18 : tiltFor(0);
  const likeOpacity = flipped ? Math.min(Math.max(offset.x / 90, 0), 1) : 0;
  const passOpacity = flipped ? Math.min(Math.max(-offset.x / 90, 0), 1) : 0;

  return (
    <div
      className="absolute inset-0 touch-none select-none"
      style={{ perspective: "1600px", zIndex: 20 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={onTap}
    >
      <div
        className={`relative h-full w-full shadow-2xl shadow-black/50 ${
          flipped ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer"
        }`}
        style={{
          transformStyle: "preserve-3d",
          transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotate}deg) rotateY(${flipped ? 180 : 0}deg)`,
          transition: isDragging ? "none" : "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            ...cardFaceStyle,
            backfaceVisibility: "hidden",
            backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.5))",
          }}
        >
          <CardFront item={item} />
          {showFlipHint && !flipped && (
            <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
              <span className="animate-bounce rounded-full bg-black/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white shadow-lg">
                Tap to read the full idea →
              </span>
            </div>
          )}
        </div>

        <div
          className="absolute inset-0 flex flex-col overflow-hidden p-6"
          style={{
            ...cardFaceStyle,
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.7))",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-bold leading-tight text-white">{item.title}</h3>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                aria-label="Edit idea"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
              >
                ✎
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                aria-label="Delete idea"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/80 text-white transition-colors hover:bg-red-500"
              >
                🗑
              </button>
            </div>
          </div>

          <div className="custom-scrollbar mt-3 flex-1 overflow-y-auto pr-1 text-sm leading-relaxed text-white/75">
            {item.body || <span className="text-white/40">No description yet.</span>}
          </div>

          {item.timeline && (
            <div className="mt-3 shrink-0">
              <p className="text-[10px] uppercase tracking-wide text-white/40">Timeline / lead time</p>
              <p className="text-sm font-semibold text-white">{item.timeline}</p>
            </div>
          )}

          <p className="mt-3 shrink-0 text-center text-[10px] uppercase tracking-wide text-white/30">
            Tap to flip back
          </p>

          <div
            className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 -rotate-12 rounded-lg border-4 border-red-500 px-3 py-1 text-xl font-black uppercase tracking-wider text-red-500"
            style={{ opacity: passOpacity }}
          >
            Pass
          </div>
          <div
            className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 rotate-12 rounded-lg border-4 border-emerald-400 px-3 py-1 text-xl font-black uppercase tracking-wider text-emerald-400"
            style={{ opacity: likeOpacity }}
          >
            Like
          </div>
        </div>
      </div>
    </div>
  );
}
