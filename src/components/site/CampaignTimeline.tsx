"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { addCampaignMilestone, deleteCampaignMilestone } from "@/app/s/[slug]/actions";
import type { CampaignMilestone } from "@/lib/database.types";

// Below this on-screen spacing between adjacent dots, the label+date text
// sitting under each one starts to visually crowd/overlap its neighbours —
// picked by eye against this widget's own type size, not derived from
// anything else. Past this point the line switches from "evenly divide the
// full width" to a fixed-spacing horizontally-scrollable strip instead.
const MIN_DOT_SPACING = 108;
const SCROLL_DOT_SPACING = 128;

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A single horizontal line at the very top of the Dashboard: every added
 * milestone becomes a dot on it. With N dots, the line divides into N+1
 * equal segments and dot i (1-indexed) sits at i/(N+1) of the line's length
 * — two dots land at 1/3 and 2/3, three at 1/4, 2/4, 3/4, and so on, so
 * every dot (and the two ends of the line) stays equally spaced. Once that
 * even spacing would put dots closer together on screen than their own
 * labels need, the line switches to fixed-spacing and horizontal scroll
 * instead (see MIN_DOT_SPACING), with a small arrow that advances to the
 * next dot rather than an open-ended scrollbar. */
export function CampaignTimeline({
  artistId,
  milestones,
}: {
  artistId: string;
  milestones: CampaignMilestone[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const addPopoverRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(todayIso());
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const sorted = useMemo(
    () => [...milestones].sort((a, b) => a.milestone_date.localeCompare(b.milestone_date)),
    [milestones]
  );
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
    function handlePointerDown(e: PointerEvent) {
      if (addPopoverRef.current && !addPopoverRef.current.contains(e.target as Node)) setAdding(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setAdding(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
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

  async function handleAdd() {
    if (!label.trim() || !date || pending) return;
    setPending(true);
    const result = await addCampaignMilestone(artistId, label.trim(), date);
    setPending(false);
    if (result.ok) {
      setLabel("");
      setDate(todayIso());
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    setSelected(null);
    await deleteCampaignMilestone(id);
  }

  const selectedMilestone = sorted.find((m) => m.id === selected) ?? null;

  return (
    <div
      className="flex flex-col gap-3 p-5"
      style={{
        backgroundColor: "rgba(0,0,0,0.4)",
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
          {adding && (
            <div className="absolute right-0 top-full z-20 mt-2 flex w-64 flex-col gap-2.5 rounded-xl border border-white/10 bg-neutral-950 p-3.5 shadow-2xl">
              <input
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="What's happening?"
                className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm text-white placeholder-white/30 focus:border-[var(--accent)] focus:outline-none"
              />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm text-white focus:border-[var(--accent)] focus:outline-none"
              />
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
          )}
        </div>
      </div>

      {n === 0 ? (
        <p className="py-4 text-center text-sm text-white/40">
          No milestones yet — add the first one to start the timeline.
        </p>
      ) : (
        <div ref={containerRef} className="relative">
          <div
            ref={scrollRef}
            className={scrollMode ? "overflow-x-auto pb-1 [scrollbar-width:thin]" : "overflow-hidden"}
          >
            <div className="relative h-16" style={{ width: scrollMode ? trackWidth : "100%", minWidth: "100%" }}>
              <div className="absolute left-0 right-0 top-2 h-px bg-white/20" />
              {sorted.map((m, i) => {
                const left = dotLeft(i);
                const isSelected = selected === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelected((s) => (s === m.id ? null : m.id))}
                    className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1.5"
                    style={{ left }}
                  >
                    <span
                      className={`block h-3 w-3 rounded-full border-2 border-black/40 transition-transform ${
                        isSelected ? "scale-125" : ""
                      }`}
                      style={{
                        backgroundColor: "var(--accent)",
                        boxShadow: isSelected ? "0 0 0 4px rgba(255,255,255,0.12)" : undefined,
                      }}
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
      )}

      {selectedMilestone && (
        <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
          <div>
            <p className="text-sm font-medium text-white/90">{selectedMilestone.label}</p>
            <p className="text-xs text-white/40">{formatDate(selectedMilestone.milestone_date)}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleDelete(selectedMilestone.id)}
            className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs text-white/50 transition-colors hover:border-red-400/40 hover:text-red-300"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
