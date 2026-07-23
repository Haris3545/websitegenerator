"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { updateContentOverride } from "@/app/s/[slug]/actions";

type Tag = "span" | "p" | "h1" | "h2" | "h3" | "div";

/** Wraps a piece of static site copy so right-clicking it opens an inline
 * editor; saving writes a permanent per-artist override (see
 * updateContentOverride) instead of just changing this one page view.
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
  const [current, setCurrent] = useState(value);
  const [draft, setDraft] = useState(value);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  function startEditing(e: React.MouseEvent) {
    e.preventDefault();
    setDraft(current);
    setEditing(true);
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
      onContextMenu={startEditing}
      title="Right-click to edit"
      className={`${className} ${isPending ? "opacity-50" : ""} decoration-dotted decoration-white/40 underline-offset-4 hover:underline`}
    >
      {current}
    </Component>
  );
}
