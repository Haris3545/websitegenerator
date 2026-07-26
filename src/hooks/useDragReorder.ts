"use client";

import { useCallback, useRef, useState } from "react";

const MOVE_THRESHOLD_PX = 6;

type Gesture = { key: string; startX: number; startY: number; started: boolean; lastOverKey: string | null };

/** Pointer-events-based drag reordering — replaces native HTML5
 * drag-and-drop everywhere in this app. Native DnD turned out unreliable in
 * practice: Firefox silently refuses to even start a drag unless
 * dataTransfer.setData() is called in onDragStart (easy to miss, and easy
 * to never notice since Chrome doesn't enforce it), and it doesn't fire at
 * all on touchscreens. Pointer events plus elementFromPoint hit-testing
 * work identically across mouse, trackpad, and touch, with none of that.
 *
 * Wire handlePointerDown(e, key) to a draggable item's onPointerDown, and
 * handlePointerMove/handlePointerUp to the same element (pointer capture
 * keeps routing events to it regardless of where the cursor physically
 * ends up). Every draggable item's DOM node also needs
 * data-reorder-key={key} so hit-testing can identify what's under the
 * cursor. onOver(dragKey, overKey) fires — live, iOS-homescreen style —
 * every time the pointer moves over a new item while dragging, so the
 * caller can reorder its list immediately rather than waiting for a drop.
 *
 * A real drag only "starts" (visually, and for onOver purposes) once the
 * pointer has moved past a small threshold — short of that, this is
 * indistinguishable from an ordinary click, so consumeWasDragging() lets a
 * child button/link check whether the gesture that just ended was actually
 * a drag before deciding whether to suppress its own click/navigation. */
export function useDragReorder(onOver: (dragKey: string, overKey: string | null) => void) {
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const justDraggedRef = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLElement>, key: string) => {
    if (e.button !== 0) return;
    justDraggedRef.current = false;
    gestureRef.current = { key, startX: e.clientX, startY: e.clientY, started: false, lastOverKey: null };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const g = gestureRef.current;
      if (!g) return;
      if (!g.started) {
        if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < MOVE_THRESHOLD_PX) return;
        g.started = true;
        g.lastOverKey = g.key;
        justDraggedRef.current = true;
        setDraggingKey(g.key);
      }
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-reorder-key]");
      const overKey = target?.dataset.reorderKey ?? null;
      if (overKey && overKey !== g.lastOverKey) {
        g.lastOverKey = overKey;
        onOver(g.key, overKey);
      }
    },
    [onOver]
  );

  const endGesture = useCallback(() => {
    gestureRef.current = null;
    setDraggingKey(null);
  }, []);

  const consumeWasDragging = useCallback(() => {
    const was = justDraggedRef.current;
    justDraggedRef.current = false;
    return was;
  }, []);

  return {
    draggingKey,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: endGesture,
    handlePointerCancel: endGesture,
    consumeWasDragging,
  };
}
