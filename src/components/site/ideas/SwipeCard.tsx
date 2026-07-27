"use client";

import { useTriggerPoof } from "@/hooks/usePoofEffect";
import type { BoardItem } from "@/lib/database.types";

// A stable "messy stack" tilt sequence, cycled by stack position, rather
// than a random angle per card — keeps the tilt consistent between renders
// instead of jittering every time the list re-sorts. Index 0 is deliberately
// unused for filler tilt (the top/interactive card never uses this sequence
// at rest — see TopCard) but index 1 is what a card was tilted at the
// moment before it became top, which SwipeStack uses as the "enter" angle
// it animates back down to flat from.
const TILT_SEQUENCE = [-4, 3, -6, 5];

export function tiltFor(index: number) {
  return TILT_SEQUENCE[index % TILT_SEQUENCE.length];
}

const cardFaceStyle = {
  borderRadius: "var(--card-radius, 16px)",
  border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
} as const;

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && target.closest("button") !== null;
}

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

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden>
    <path
      d="M5 12.5 10 17.5 19 7"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CrossIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden>
    <path d="M6 6 18 18M18 6 6 18" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
  </svg>
);

const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
    <path
      d="M4 17.25V20h2.75L17.81 8.94l-2.75-2.75L4 17.25ZM19.71 7.04a1 1 0 0 0 0-1.41l-1.34-1.34a1 1 0 0 0-1.41 0l-1.34 1.34 2.75 2.75 1.34-1.34Z"
      fill="currentColor"
    />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
    <path
      d="M6 7h12M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7M7.5 7l.7 11.2A1.5 1.5 0 0 0 9.7 19.5h4.6a1.5 1.5 0 0 0 1.5-1.3L16.5 7"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TapIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
    <path
      d="M9 11.5V6a1.5 1.5 0 0 1 3 0v5m0-2V4.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V12m0-.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6.5 7-3 0-4.3-1.2-5.7-3l-2-3.3c-.5-.9-.2-1.9.6-2.3.8-.4 1.7 0 2.2.8L9 14"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** A blurred, darkened blow-up of the card's own image, filling the flipped
 * back face behind the text — instead of a flat tint — so the back reads as
 * part of the same object rather than a plain settings panel. */
function BlurredBackdrop({ imageUrl }: { imageUrl: string | null }) {
  if (!imageUrl) return <div className="absolute inset-0 bg-neutral-800" />;
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="" className="h-full w-full scale-125 object-cover blur-2xl brightness-[0.85]" />
      <div className="absolute inset-0 bg-black/20" />
    </div>
  );
}

export function TopCard({
  item,
  flipped,
  offset,
  rotation,
  restRotate,
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
  rotation: number;
  restRotate: number;
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
  const rotate = flipped ? rotation : restRotate;
  const likeOpacity = flipped ? Math.min(Math.max(offset.x / 90, 0), 1) : 0;
  const passOpacity = flipped ? Math.min(Math.max(-offset.x / 90, 0), 1) : 0;
  const triggerPoof = useTriggerPoof();

  return (
    <div
      className="absolute inset-0 touch-none select-none"
      style={{ perspective: "1600px", zIndex: 20 }}
      onPointerDown={(e) => !isInteractiveTarget(e.target) && onPointerDown(e)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={(e) => !isInteractiveTarget(e.target) && onTap()}
    >
      <div
        className={`relative h-full w-full shadow-2xl shadow-black/50 ${
          flipped ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer"
        }`}
        style={{
          transformStyle: "preserve-3d",
          transformOrigin: "top center",
          transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotate}deg) rotateY(${flipped ? 180 : 0}deg)`,
          transition: isDragging ? "none" : "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
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
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-start gap-2 pt-6">
              <div className="animate-hint-pulse flex flex-col items-center gap-1.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white shadow-lg backdrop-blur-md ring-1 ring-inset ring-white/30">
                  <TapIcon />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/85 drop-shadow-sm">
                  Tap to read
                </span>
              </div>
            </div>
          )}
        </div>

        <div
          className="absolute inset-0 flex flex-col overflow-hidden p-5"
          style={{
            ...cardFaceStyle,
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <BlurredBackdrop imageUrl={item.image_url} />
          <div className="relative flex items-start justify-between gap-3">
            <h3 className="text-base font-bold leading-tight text-white drop-shadow-md">{item.title}</h3>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                aria-label="Edit idea"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
              >
                <EditIcon />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerPoof(e.clientX, e.clientY);
                  onDelete();
                }}
                aria-label="Delete idea"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/80 text-white transition-colors hover:bg-red-500"
              >
                <TrashIcon />
              </button>
            </div>
          </div>

          <div className="custom-scrollbar mt-2.5 flex-1 overflow-y-auto pr-1 text-sm leading-relaxed text-white/90 drop-shadow-sm">
            {item.body || <span className="text-white/50">No description yet.</span>}
          </div>

          {item.timeline && (
            <div className="mt-2.5 shrink-0">
              <p className="text-[10px] uppercase tracking-wide text-white/60 drop-shadow-sm">Timeline / lead time</p>
              <p className="text-sm font-semibold text-white drop-shadow-sm">{item.timeline}</p>
            </div>
          )}

          <p className="mt-2 shrink-0 text-center text-[10px] uppercase tracking-wide text-white/50 drop-shadow-sm">
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

export { CheckIcon, CrossIcon };
