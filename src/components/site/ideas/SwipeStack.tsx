"use client";

import { useEffect, useRef, useState } from "react";
import { useSwipeGesture, type SwipeDirection } from "@/hooks/useSwipeGesture";
import { FillerCard, TopCard, CheckIcon, CrossIcon, tiltFor } from "@/components/site/ideas/SwipeCard";
import type { BoardItem } from "@/lib/database.types";

const IDLE_HINT_MS = 2000;
const STACK_DEPTH = 4;

/** The Tinder-style stack in the middle of the Ideas tab. Only the top card
 * is interactive: it starts showing its image+title (see SwipeCard.tsx),
 * and has to be tapped once to flip over and reveal the description before
 * a swipe (drag, or the flanking buttons) is allowed at all — dragging the
 * front, unflipped face does nothing but flip it. An idle 2s nudge hints at
 * that requirement rather than leaving someone to guess why swiping isn't
 * doing anything. */
export function SwipeStack({
  items,
  onDecision,
  onEdit,
  onDelete,
}: {
  items: BoardItem[];
  onDecision: (id: string, direction: SwipeDirection) => void;
  onEdit: (item: BoardItem) => void;
  onDelete: (item: BoardItem) => void;
}) {
  const top = items[0];
  const [flipped, setFlipped] = useState(false);
  const [showFlipHint, setShowFlipHint] = useState(false);
  // The top card rests flat (0deg) — only the fillers behind it are tilted.
  // When a new card is promoted to top, it briefly starts at the tilt it
  // had as the next-in-line filler and animates down to flat, so the
  // promotion itself reads as a little settle rather than an abrupt snap.
  const [restRotate, setRestRotate] = useState(0);
  const lastTopId = useRef<string | null>(null);

  useEffect(() => {
    if (top?.id === lastTopId.current) return;
    lastTopId.current = top?.id ?? null;
    setFlipped(false);
    setShowFlipHint(false);
    setRestRotate(tiltFor(1));
    const raf = requestAnimationFrame(() => setRestRotate(0));
    return () => cancelAnimationFrame(raf);
  }, [top?.id]);

  useEffect(() => {
    if (!top || flipped) return;
    const timer = window.setTimeout(() => setShowFlipHint(true), IDLE_HINT_MS);
    return () => window.clearTimeout(timer);
  }, [top, flipped]);

  const gesture = useSwipeGesture({
    enabled: flipped,
    onCommit: (direction) => {
      if (top) onDecision(top.id, direction);
    },
  });

  function handleTap() {
    if (gesture.consumeWasDragged()) return;
    setFlipped((f) => !f);
  }

  if (!top) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-white/40">
        <p className="text-sm">No ideas left to review — add a new one below.</p>
      </div>
    );
  }

  const fillers = items.slice(1, STACK_DEPTH).reverse();

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex w-full items-center justify-center gap-4 sm:gap-6">
        <button
          type="button"
          disabled={!flipped}
          onClick={() => gesture.commitProgrammatically("disliked")}
          aria-label="Pass on this idea"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-red-400 to-red-600 text-white shadow-lg shadow-red-900/40 ring-1 ring-inset ring-white/20 transition-all duration-150 hover:scale-105 hover:shadow-red-900/60 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:scale-100"
        >
          <CrossIcon />
        </button>

        <div className="relative aspect-[2/3] w-[72vw] max-w-[280px] sm:w-[60vw] sm:max-w-sm">
          {fillers.map((item, i) => (
            <FillerCard key={item.id} item={item} index={fillers.length - i} />
          ))}
          <TopCard
            item={top}
            flipped={flipped}
            offset={gesture.offset}
            rotation={gesture.rotation}
            restRotate={restRotate}
            isDragging={gesture.isDragging}
            showFlipHint={showFlipHint}
            onPointerDown={gesture.handlePointerDown}
            onPointerMove={gesture.handlePointerMove}
            onPointerUp={gesture.handlePointerUp}
            onPointerCancel={gesture.handlePointerCancel}
            onTap={handleTap}
            onEdit={() => onEdit(top)}
            onDelete={() => onDelete(top)}
          />
        </div>

        <button
          type="button"
          disabled={!flipped}
          onClick={() => gesture.commitProgrammatically("liked")}
          aria-label="Like this idea"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-emerald-300 to-emerald-500 text-black shadow-lg shadow-emerald-900/40 ring-1 ring-inset ring-white/30 transition-all duration-150 hover:scale-105 hover:shadow-emerald-900/60 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:scale-100"
        >
          <CheckIcon />
        </button>
      </div>

      <p className="text-xs text-white/35">
        {flipped ? "Drag the card, or use the buttons, to decide" : "Tap the card to read it first"}
      </p>
    </div>
  );
}
