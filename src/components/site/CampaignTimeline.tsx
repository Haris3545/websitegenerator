"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  addCampaignMilestone,
  deleteCampaignMilestone,
  repositionCampaignMilestone,
  updateCampaignMilestone,
} from "@/app/s/[slug]/actions";
import { useClosableOverlay } from "@/hooks/useClosableOverlay";
import type { CampaignMilestone } from "@/lib/database.types";

// Below this on-screen spacing between adjacent dots, the label+date text
// sitting under each one starts to visually crowd/overlap its neighbours —
// picked by eye against this widget's own type size, not derived from
// anything else. Past this point the line switches from "evenly divide the
// full width" to a fixed-spacing horizontally-scrollable strip instead.
const MIN_DOT_SPACING = 108;
const SCROLL_DOT_SPACING = 128;
const DRAG_MOVE_THRESHOLD = 5;

function formatDate(iso: string | null): string {
  if (!iso) return "Date TBC";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sortMilestones(list: CampaignMilestone[]): CampaignMilestone[] {
  return [...list].sort((a, b) => a.sort_order - b.sort_order);
}

/** A single horizontal line at the very top of the Dashboard: every added
 * milestone becomes a dot on it. With N dots, the line divides into N+1
 * equal segments and dot i (1-indexed) sits at i/(N+1) of the line's length
 * — two dots land at 1/3 and 2/3, three at 1/4, 2/4, 3/4, and so on, so
 * every dot (and the two ends of the line) stays equally spaced. Once that
 * even spacing would put dots closer together on screen than their own
 * labels need, the line switches to fixed-spacing and horizontal scroll
 * instead (see MIN_DOT_SPACING), with a small arrow that advances to the
 * next dot rather than an open-ended scrollbar.
 *
 * A milestone doesn't need a real date — "Date TBC" ones sort by an
 * explicit sort_order instead (see actions.ts), placed at the very start
 * of the line when first created, then draggable to sit anywhere between
 * two other dots (or set explicitly via the edit view's "between X and Y"
 * pickers). Dated milestones sort by their date's own timestamp, so the
 * two kinds interleave naturally on the same line. */
export function CampaignTimeline({
  artistId,
  milestones,
}: {
  artistId: string;
  milestones: CampaignMilestone[];
}) {
  const [items, setItems] = useState(milestones);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const addPopoverRef = useRef<HTMLDivElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [tbc, setTbc] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const dragRef = useRef<{
    id: string;
    startX: number;
    startLeft: number;
    moved: boolean;
  } | null>(null);
  // pointerup -> click is always the sequence, regardless of movement in
  // between, and handleDotPointerUp clears dragRef.current before that
  // click ever fires — reading dragRef.current?.moved from the click
  // handler itself would always see it already nulled out, so every
  // drag-then-release was immediately treated as a plain click and
  // reopened the edit modal right after dropping a dot. This ref captures
  // the moved flag at the moment of release, before it's cleared, so the
  // click handler can still see it (same fix as CommentMap's own
  // wasDraggingRef).
  const wasDraggingRef = useRef(false);
  const [dragVisual, setDragVisual] = useState<{ id: string; left: number } | null>(null);

  const sorted = useMemo(() => sortMilestones(items), [items]);
  const n = sorted.length;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!adding) return;
    // The panel now stays mounted so it can animate shut (see the unfurl
    // wrapper below) instead of unmounting instantly — autoFocus only ever
    // fires once, on mount, so it wouldn't refocus on a second open. A
    // short delay lets the unfurl-open transition actually start first,
    // matching how it visually reads (focusing an element still animating
    // to size 0 does nothing useful).
    const focusTimer = window.setTimeout(() => addInputRef.current?.focus(), 50);
    function handlePointerDown(e: PointerEvent) {
      if (addPopoverRef.current && !addPopoverRef.current.contains(e.target as Node)) setAdding(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setAdding(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [adding]);

  const fitSpacing = n > 0 && containerWidth > 0 ? containerWidth / (n + 1) : Infinity;
  const scrollMode = n > 0 && fitSpacing < MIN_DOT_SPACING;
  const trackWidth = scrollMode ? (n + 1) * SCROLL_DOT_SPACING : containerWidth;

  function dotLeft(i: number): number {
    return scrollMode ? (i + 1) * SCROLL_DOT_SPACING : (i + 1) * fitSpacing;
  }

  function scrollToNext() {
    const el = scrollRef.current;
    if (!el) return;
    const visibleRight = el.scrollLeft + el.clientWidth;
    const next = sorted.map((_, i) => dotLeft(i)).find((left) => left > visibleRight - SCROLL_DOT_SPACING * 0.5);
    if (next === undefined) return;
    el.scrollTo({ left: Math.max(0, next - el.clientWidth * 0.35), behavior: "smooth" });
  }

  function resetComposer() {
    setLabel("");
    setDescription("");
    setTbc(false);
    setDate(todayIso());
  }

  async function handleAdd() {
    if (!label.trim() || (!tbc && !date) || pending) return;
    setPending(true);
    const result = await addCampaignMilestone(artistId, label, description, tbc ? null : date, tbc);
    setPending(false);
    if (result.ok) {
      setItems((prev) => [...prev, result.milestone]);
      resetComposer();
      setAdding(false);
    }
  }

  function handleDeleted(id: string) {
    setItems((prev) => prev.filter((m) => m.id !== id));
    setEditingId(null);
    void deleteCampaignMilestone(id);
  }

  function handleSaved(updated: CampaignMilestone) {
    setItems((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  }

  // Only TBC dots are draggable — a dated milestone's position comes
  // straight from its real date, so dragging it wouldn't mean anything
  // without also changing that date (which the edit view already covers).
  function makeDotPointerDown(m: CampaignMilestone, index: number) {
    return (e: React.PointerEvent) => {
      if (!m.is_tbc) return;
      e.stopPropagation();
      dragRef.current = { id: m.id, startX: e.clientX, startLeft: dotLeft(index), moved: false };
      (e.target as Element).setPointerCapture(e.pointerId);
    };
  }

  function handleDotPointerMove(e: React.PointerEvent) {
    const ds = dragRef.current;
    if (!ds) return;
    const dx = e.clientX - ds.startX;
    if (!ds.moved && Math.abs(dx) > DRAG_MOVE_THRESHOLD) ds.moved = true;
    if (!ds.moved) return;
    const raw = ds.startLeft + dx;
    const max = scrollMode ? trackWidth : containerWidth;
    setDragVisual({ id: ds.id, left: Math.max(0, Math.min(max, raw)) });
  }

  async function handleDotPointerUp() {
    const ds = dragRef.current;
    wasDraggingRef.current = ds?.moved ?? false;
    dragRef.current = null;
    if (!ds || !ds.moved || !dragVisual) {
      setDragVisual(null);
      return;
    }
    const draggedId = ds.id;
    const dropLeft = dragVisual.left;
    setDragVisual(null);

    const others = sorted.filter((m) => m.id !== draggedId);
    let beforeId: string | null = null;
    let afterId: string | null = null;
    for (const other of others) {
      const otherIndex = sorted.findIndex((m) => m.id === other.id);
      const otherLeft = dotLeft(otherIndex);
      if (otherLeft <= dropLeft) beforeId = other.id;
      else {
        afterId = other.id;
        break;
      }
    }

    const before = others.find((m) => m.id === beforeId);
    const after = others.find((m) => m.id === afterId);
    // No before/after neighbour at all only happens when this is the only
    // milestone on the line — nothing to reorder relative to, so its own
    // current sort_order is as good a value as any (and, unlike Date.now(),
    // doesn't trip the "components must be pure" rule for a value that's
    // about to be overwritten by the server's real response a moment later
    // anyway).
    const draggedCurrent = sorted.find((m) => m.id === draggedId);
    const newSortOrder =
      before && after
        ? (before.sort_order + after.sort_order) / 2
        : before
          ? before.sort_order - 86400
          : after
            ? after.sort_order + 86400
            : (draggedCurrent?.sort_order ?? 0);
    setItems((prev) => prev.map((m) => (m.id === draggedId ? { ...m, sort_order: newSortOrder } : m)));

    const result = await repositionCampaignMilestone(draggedId, beforeId, afterId);
    if (result.ok) handleSaved(result.milestone);
  }

  const editingMilestone = sorted.find((m) => m.id === editingId) ?? null;

  return (
    <div
      className="flex flex-col gap-3 p-5"
      style={{
        backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
        border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
        borderRadius: "var(--card-radius, 12px)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/70">
          <span className="h-3 w-1 bg-[var(--accent)]" />
          Campaign timeline
        </h3>
        <div ref={addPopoverRef} className="relative">
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            + Add
          </button>
          {/* Unfurls open/closed via a grid-template-rows 0fr<->1fr animation
              (same technique FontPicker's dropdown uses) rather than
              popping in/out instantly — the panel stays mounted so it can
              actually animate shut instead of just disappearing. */}
          <div
            className={`absolute right-0 top-full z-20 mt-2 grid w-72 transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              adding ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="overflow-hidden">
              <div
                className={`flex flex-col gap-2.5 rounded-xl border border-white/10 bg-neutral-950 p-3.5 shadow-2xl transition-opacity duration-200 ${
                  adding ? "opacity-100 delay-100" : "opacity-0"
                }`}
              >
              <input
                ref={addInputRef}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="What's happening?"
                className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm text-white placeholder-white/30 focus:border-[var(--accent)] focus:outline-none"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="resize-none rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm text-white placeholder-white/30 focus:border-[var(--accent)] focus:outline-none"
              />
              <label className="flex items-center gap-2 text-xs text-white/60">
                <input
                  type="checkbox"
                  checked={tbc}
                  onChange={(e) => setTbc(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                Date TBC — place it on the line now, pin down the date later
              </label>
              {!tbc && (
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm text-white focus:border-[var(--accent)] focus:outline-none"
                />
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="rounded-full px-3 py-1 text-xs text-white/50 hover:text-white/80"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!label.trim() || pending}
                  onClick={() => void handleAdd()}
                  className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-40"
                >
                  {pending ? "Adding…" : "Add"}
                </button>
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div ref={containerRef} className="relative">
        <div
          ref={scrollRef}
          className={scrollMode ? "overflow-x-auto pb-1 [scrollbar-width:thin]" : "overflow-hidden"}
        >
          <div className="relative h-16" style={{ width: scrollMode ? trackWidth : "100%", minWidth: "100%" }}>
            <div className="absolute left-0 right-0 top-2 h-px bg-white/20" />
            {n === 0 && (
              <p className="absolute left-1/2 top-6 -translate-x-1/2 text-xs text-white/30">
                No milestones yet — add the first one.
              </p>
            )}
            {sorted.map((m, i) => {
              const isDragging = dragVisual?.id === m.id;
              const left = isDragging ? dragVisual.left : dotLeft(i);
              return (
                <button
                  key={m.id}
                  type="button"
                  onPointerDown={makeDotPointerDown(m, i)}
                  onPointerMove={handleDotPointerMove}
                  onPointerUp={handleDotPointerUp}
                  onClick={() => {
                    if (wasDraggingRef.current) {
                      wasDraggingRef.current = false;
                      return;
                    }
                    setEditingId(m.id);
                  }}
                  className={`absolute top-0 flex flex-col items-center gap-1.5 ${
                    isDragging ? "" : "-translate-x-1/2"
                  } ${m.is_tbc ? "cursor-grab active:cursor-grabbing" : ""}`}
                  style={{ left, transition: isDragging ? "none" : "left 250ms ease" }}
                >
                  <span
                    className={`block h-3 w-3 rounded-full border-2 transition-transform ${
                      m.is_tbc ? "border-dashed border-white/50" : "border-black/40"
                    }`}
                    style={{ backgroundColor: m.is_tbc ? "transparent" : "var(--accent)" }}
                  />
                  <span className="max-w-[6.5rem] truncate text-[11px] font-medium text-white/80">{m.label}</span>
                  <span className="text-[10px] text-white/40">{formatDate(m.milestone_date)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {scrollMode && (
          <button
            type="button"
            onClick={scrollToNext}
            aria-label="Scroll to next milestone"
            className="absolute -right-2 top-1 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3" aria-hidden>
              <path d="m7.5 5.5 5 4.5-5 4.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {editingMilestone && (
        <MilestoneEditModal
          milestone={editingMilestone}
          allMilestones={sorted}
          onClose={() => setEditingId(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}

function MilestoneEditModal({
  milestone,
  allMilestones,
  onClose,
  onSaved,
  onDeleted,
}: {
  milestone: CampaignMilestone;
  allMilestones: CampaignMilestone[];
  onClose: () => void;
  onSaved: (m: CampaignMilestone) => void;
  onDeleted: (id: string) => void;
}) {
  const { closing, requestClose } = useClosableOverlay(onClose);
  const [label, setLabel] = useState(milestone.label);
  const [description, setDescription] = useState(milestone.description ?? "");
  const [tbc, setTbc] = useState(milestone.is_tbc);
  const [date, setDate] = useState(milestone.milestone_date ?? todayIso());
  const [saving, setSaving] = useState(false);

  const others = allMilestones.filter((m) => m.id !== milestone.id);
  const currentIndex = allMilestones.findIndex((m) => m.id === milestone.id);
  const [beforeId, setBeforeId] = useState<string>(allMilestones[currentIndex - 1]?.id ?? "");
  const [afterId, setAfterId] = useState<string>(allMilestones[currentIndex + 1]?.id ?? "");

  async function handleSave() {
    if (!label.trim() || (!tbc && !date)) return;
    setSaving(true);
    const result = await updateCampaignMilestone(milestone.id, label, description, tbc ? null : date, tbc);
    if (tbc && result.ok) {
      const reposResult = await repositionCampaignMilestone(milestone.id, beforeId || null, afterId || null);
      setSaving(false);
      if (reposResult.ok) onSaved(reposResult.milestone);
      requestClose();
      return;
    }
    setSaving(false);
    if (result.ok) onSaved(result.milestone);
    requestClose();
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={requestClose}>
      <div
        className={`w-full max-w-sm rounded-xl border border-white/10 bg-neutral-950 p-5 shadow-2xl ${
          closing ? "animate-modal-out" : "animate-modal-in"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-white">Edit milestone</p>

        <label className="mt-3 flex flex-col gap-1 text-xs text-white/50">
          Name
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm text-white focus:border-[var(--accent)] focus:outline-none"
          />
        </label>

        <label className="mt-3 flex flex-col gap-1 text-xs text-white/50">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="resize-none rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm text-white focus:border-[var(--accent)] focus:outline-none"
          />
        </label>

        <label className="mt-3 flex items-center gap-2 text-xs text-white/60">
          <input type="checkbox" checked={tbc} onChange={(e) => setTbc(e.target.checked)} className="accent-[var(--accent)]" />
          Date TBC
        </label>

        {tbc ? (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-xs text-white/40">Position it between:</p>
            <div className="flex items-center gap-2">
              <select
                value={beforeId}
                onChange={(e) => setBeforeId(e.target.value)}
                className="flex-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-[var(--accent)] focus:outline-none"
              >
                <option value="">— start of line —</option>
                {others.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-white/30">and</span>
              <select
                value={afterId}
                onChange={(e) => setAfterId(e.target.value)}
                className="flex-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-[var(--accent)] focus:outline-none"
              >
                <option value="">— end of line —</option>
                {others.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <label className="mt-3 flex flex-col gap-1 text-xs text-white/50">
            Date
            <input
              type="date"
              value={date ?? ""}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm text-white focus:border-[var(--accent)] focus:outline-none"
            />
          </label>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onDeleted(milestone.id)}
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/50 transition-colors hover:border-red-400/40 hover:text-red-300"
          >
            Delete
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={requestClose} className="rounded-full px-3 py-1.5 text-xs text-white/50 hover:text-white/80">
              Cancel
            </button>
            <button
              type="button"
              disabled={!label.trim() || saving}
              onClick={() => void handleSave()}
              className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
