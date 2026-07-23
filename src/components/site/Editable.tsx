"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { updateContentOverride } from "@/app/s/[slug]/actions";

type Tag = "span" | "p" | "h1" | "h2" | "h3" | "div";

const HOLD_MS = 450;
const MOVE_CANCEL_PX = 8;

/** Wraps a piece of static site copy so pressing and holding it opens an
 * inline editor; saving writes a permanent per-artist override (see
 * updateContentOverride) instead of just changing this one page view.
 * Deliberately not right-click-to-edit — that fights the browser's own
 * context menu and doesn't work on touch devices. A visible fill animation
 * shows the hold progress so it doesn't feel unresponsive.
 * Scoped to fixed copy baked into components — dynamic per-row data (article
 * titles, computed stats) isn't wrapped in this, since "editing" a fetched
 * record in place wouldn't mean anything once it's re-fetched. */
export function Editable({
  artistId,
  contentKey,
  value,
  as = "span",
  className = "",
}: {
  artistId: string;
  contentKey: string;
  value: string;
  as?: Tag;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [holding, setHolding] = useState(false);
  const [current, setCurrent] = useState(value);
  const [draft, setDraft] = useState(value);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  function resize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  // Runs once when entering edit mode, not on every keystroke — an inline
  // ref callback would re-fire focus()/select() on every re-render (i.e.
  // every character typed), which re-selects all the text each time and
  // makes typing effectively impossible.
  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.select();
    resize(el);
  }, [editing]);

  function clearHoldTimer() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    pressStart.current = null;
    setHolding(false);
  }

  function startEditing() {
    setDraft(current);
    setEditing(true);
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return; // left click / touch / pen only
    pressStart.current = { x: e.clientX, y: e.clientY };
    setHolding(true);
    holdTimer.current = setTimeout(() => {
      clearHoldTimer();
      startEditing();
    }, HOLD_MS);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!pressStart.current) return;
    const dx = e.clientX - pressStart.current.x;
    const dy = e.clientY - pressStart.current.y;
    if (Math.abs(dx) > MOVE_CANCEL_PX || Math.abs(dy) > MOVE_CANCEL_PX) clearHoldTimer();
  }

  function save() {
    setEditing(false);
    if (draft === current) return;
    setCurrent(draft);
    startTransition(() => updateContentOverride(artistId, contentKey, draft));
  }

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          resize(e.target);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        onBlur={save}
        rows={1}
        className={`${className} min-w-[12ch] resize-none rounded border border-[var(--accent)] bg-black/80 px-1 py-0 outline-none`}
      />
    );
  }

  const Component = as;
  return (
    <Component
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clearHoldTimer}
      onPointerLeave={clearHoldTimer}
      onPointerCancel={clearHoldTimer}
      onContextMenu={(e: React.MouseEvent) => e.preventDefault()}
      title="Press and hold to edit"
      style={{ transition: holding ? `opacity ${HOLD_MS}ms linear` : undefined }}
      className={`${className} ${isPending || holding ? "opacity-50" : ""} cursor-pointer select-none decoration-dotted decoration-white/40 underline-offset-4 hover:underline`}
    >
      {current}
    </Component>
  );
}
