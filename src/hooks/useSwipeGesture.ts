"use client";

import { useCallback, useRef, useState } from "react";

const COMMIT_DISTANCE_PX = 120;
const COMMIT_VELOCITY_PX_MS = 0.6;

export type SwipeDirection = "liked" | "disliked";

type Gesture = { startX: number; startY: number; startTime: number; started: boolean };

/** Pointer-driven Tinder-style swipe physics for the Ideas card stack.
 * Reports a live (dx, dy) offset while dragging so the caller can drive the
 * card's transform/rotation and the LIKE/PASS stamp opacity, then resolves
 * to either a committed swipe (past a distance or flick-velocity threshold)
 * or a spring-back to center. Mirrors the pointer-capture + move-threshold
 * shape used elsewhere (useDragReorder) so an ordinary tap is never
 * misread as a drag. */
export function useSwipeGesture({
  enabled,
  onCommit,
}: {
  enabled: boolean;
  onCommit: (direction: SwipeDirection) => void;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const gestureRef = useRef<Gesture | null>(null);
  const wasDraggedRef = useRef(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!enabled || e.button !== 0 || isSettling) return;
      wasDraggedRef.current = false;
      gestureRef.current = { startX: e.clientX, startY: e.clientY, startTime: performance.now(), started: false };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [enabled, isSettling]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const g = gestureRef.current;
    if (!g) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (!g.started) {
      if (Math.hypot(dx, dy) < 6) return;
      g.started = true;
      wasDraggedRef.current = true;
      setIsDragging(true);
    }
    setOffset({ x: dx, y: dy });
  }, []);

  const settle = useCallback(
    (direction: SwipeDirection | null) => {
      setIsDragging(false);
      if (!direction) {
        setIsSettling(true);
        setOffset({ x: 0, y: 0 });
        window.setTimeout(() => setIsSettling(false), 300);
        return;
      }
      const flyX = direction === "liked" ? window.innerWidth : -window.innerWidth;
      setIsSettling(true);
      setOffset({ x: flyX, y: offset.y });
      window.setTimeout(() => {
        onCommit(direction);
        // The next card takes over this same hook instance (SwipeStack
        // never unmounts it) — without resetting here, isSettling would
        // stay stuck true forever after the very first swipe, permanently
        // blocking every card after it, and the new top card would render
        // pre-translated off-screen at the old fly-out offset.
        setOffset({ x: 0, y: 0 });
        setIsSettling(false);
      }, 220);
    },
    [offset.y, onCommit]
  );

  const endGesture = useCallback(() => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g || !g.started) {
      setIsDragging(false);
      return;
    }
    const dx = offset.x;
    const elapsed = Math.max(1, performance.now() - g.startTime);
    const velocity = dx / elapsed;
    if (dx >= COMMIT_DISTANCE_PX || velocity >= COMMIT_VELOCITY_PX_MS) {
      settle("liked");
    } else if (dx <= -COMMIT_DISTANCE_PX || velocity <= -COMMIT_VELOCITY_PX_MS) {
      settle("disliked");
    } else {
      settle(null);
    }
  }, [offset.x, settle]);

  const commitProgrammatically = useCallback(
    (direction: SwipeDirection) => {
      if (isSettling) return;
      settle(direction);
    },
    [isSettling, settle]
  );

  const consumeWasDragged = useCallback(() => {
    const was = wasDraggedRef.current;
    wasDraggedRef.current = false;
    return was;
  }, []);

  return {
    offset,
    // Always rotates as if the card were hinged along its top edge — a
    // fixed, predictable swing (not corner-dependent) rather than physics
    // that changes depending on where you happen to grab the card.
    rotation: offset.x / 18,
    isDragging,
    isSettling,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: endGesture,
    handlePointerCancel: endGesture,
    commitProgrammatically,
    consumeWasDragged,
  };
}
