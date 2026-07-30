"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useClosableOverlay } from "@/hooks/useClosableOverlay";
import { addCampaignBlock, deleteCampaignBlock, updateCampaignBlock } from "@/app/s/[slug]/campaignBlockActions";
import { TACTIC_PILLARS, type TacticPillar } from "@/lib/tacticFields";
import type { BoardItem } from "@/lib/database.types";

const DAY_WIDTH = 44;
const LABEL_WIDTH = 108;
const HEADER_MONTH_HEIGHT = 28;
const HEADER_DAY_HEIGHT = 40;
const HEADER_TOTAL_HEIGHT = HEADER_MONTH_HEIGHT + HEADER_DAY_HEIGHT;
const LANE_HEIGHT = 28;
const LANE_GAP = 6;
const ROW_PADDING = 10;
const DOMAIN_BEFORE_DAYS = 14;
const DOMAIN_TOTAL_DAYS = 300;
const HOLD_MS = 1000;
const HOLD_MOVE_THRESHOLD = 6;
const DRAG_MOVE_THRESHOLD = 5;
const TODAY_FRACTION = 1 / 6;
const ROW_HEIGHT_TRANSITION = "height 280ms cubic-bezier(0.16, 1, 0.3, 1)";

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
function daysBetween(a: Date, b: Date) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}
function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Block = BoardItem & { startIdx: number; endIdx: number; lane: number };

/** The Calendar tab's Tease/Release/Sustain campaign-planning timeline —
 * three fixed pillar rows on a scrollable day-by-day strip. Backed by the
 * same `board_items` rows the Tactics tab already uses (pillar +
 * campaign_start_date/end_date), so a block created here is also a tactic
 * card there, and vice versa.
 *
 * Four ways to work with a block: the "+ Add block" button under each
 * row's label (opens the named modal directly); holding the pointer
 * stationary on an empty stretch of a row for ~1 second, which drops a
 * draft block anchored at that day and lets you drag to extend its end
 * date before naming it; dragging a block's own left/right edge to resize
 * it after the fact; or dragging the block itself to move it in time
 * and/or to a different pillar row entirely. Plain dragging on empty
 * space (not a block) pans the timeline instead of drafting — the hold
 * has to stay still for that first second. Overlapping blocks in a row
 * stack into extra lanes, and the row's own height animates as that
 * count grows or shrinks rather than snapping. */
export function CampaignGanttBoard({
  artistId,
  initialBlocks,
}: {
  artistId: string;
  initialBlocks: BoardItem[];
}) {
  const [items, setItems] = useState(initialBlocks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<BoardItem | null>(null);
  const [addModal, setAddModal] = useState<{
    pillar: TacticPillar;
    startIdx: number;
    endIdx: number;
  } | null>(null);
  const [draft, setDraft] = useState<{ pillar: TacticPillar; startIdx: number; endIdx: number } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledOnceRef = useRef(false);

  const domainStart = useMemo(() => startOfDay(addDays(new Date(), -DOMAIN_BEFORE_DAYS)), []);
  const days = useMemo(
    () => Array.from({ length: DOMAIN_TOTAL_DAYS }, (_, i) => addDays(domainStart, i)),
    [domainStart]
  );
  const todayIdx = useMemo(() => daysBetween(domainStart, new Date()), [domainStart]);
  const totalWidth = DOMAIN_TOTAL_DAYS * DAY_WIDTH;

  const monthGroups = useMemo(() => {
    const groups: { label: string; dayCount: number }[] = [];
    for (const d of days) {
      const label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.dayCount += 1;
      else groups.push({ label, dayCount: 1 });
    }
    return groups;
  }, [days]);

  const blocksByPillar = useMemo(() => {
    const result: Record<TacticPillar, Block[]> = { tease: [], launch: [], sustain: [] };
    for (const item of items) {
      const pillar = item.pillar as TacticPillar | null;
      if (!pillar || !item.campaign_start_date || !item.campaign_end_date) continue;
      const startIdx = clampIdx(daysBetween(domainStart, new Date(`${item.campaign_start_date}T00:00:00`)));
      const endIdx = clampIdx(daysBetween(domainStart, new Date(`${item.campaign_end_date}T00:00:00`)));
      result[pillar].push({ ...item, startIdx, endIdx: Math.max(startIdx, endIdx), lane: 0 });
    }
    for (const pillar of Object.keys(result) as TacticPillar[]) {
      result[pillar] = assignLanes(result[pillar]);
    }
    return result;
  }, [items, domainStart]);

  function clampIdx(i: number) {
    return Math.max(0, Math.min(DOMAIN_TOTAL_DAYS - 1, i));
  }

  function laneCount(pillar: TacticPillar) {
    return Math.max(1, ...blocksByPillar[pillar].map((b) => b.lane + 1), 1);
  }
  function rowHeight(pillar: TacticPillar) {
    const lanes = laneCount(pillar);
    return lanes * LANE_HEIGHT + (lanes - 1) * LANE_GAP + ROW_PADDING * 2;
  }

  // Cumulative top offset of each pillar row, in row-space (i.e. measured
  // from directly under the two header rows) — used to figure out which
  // row a block is currently being dragged over, and to position the
  // floating drag clone.
  const rowTops = useMemo(() => {
    const tops: Record<TacticPillar, number> = { tease: 0, launch: 0, sustain: 0 };
    let y = 0;
    for (const p of TACTIC_PILLARS) {
      tops[p.value] = y;
      y += rowHeight(p.value);
    }
    return tops;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rowHeight closes over blocksByPillar, which is the real dependency
  }, [blocksByPillar]);

  // Once a drag is locked onto a row, it takes clearing that row's boundary
  // by ROW_SWITCH_MARGIN (not just crossing the line by a pixel) to switch
  // to a neighbour — without this, a fast, mostly-horizontal drag with any
  // natural vertical jitter would flip back and forth between two rows
  // every time the pointer straddled the boundary, which is what read as
  // the block "moving back and forth weirdly."
  const ROW_SWITCH_MARGIN = 14;

  function pillarFromClientY(clientY: number, preferred?: TacticPillar): TacticPillar {
    const el = scrollRef.current;
    if (!el) return TACTIC_PILLARS[0].value;
    const rect = el.getBoundingClientRect();
    const yInRows = clientY - rect.top - HEADER_TOTAL_HEIGHT;

    if (preferred) {
      let top = 0;
      for (const p of TACTIC_PILLARS) {
        const h = rowHeight(p.value);
        if (p.value === preferred) {
          if (yInRows >= top - ROW_SWITCH_MARGIN && yInRows < top + h + ROW_SWITCH_MARGIN) return preferred;
          break;
        }
        top += h;
      }
    }

    let cursor = 0;
    for (const p of TACTIC_PILLARS) {
      const h = rowHeight(p.value);
      if (yInRows < cursor + h) return p.value;
      cursor += h;
    }
    return TACTIC_PILLARS[TACTIC_PILLARS.length - 1].value;
  }

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || scrolledOnceRef.current) return;
    scrolledOnceRef.current = true;
    el.scrollLeft = Math.max(0, todayIdx * DAY_WIDTH - el.clientWidth * TODAY_FRACTION);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only ever runs the very first time the scroll container mounts with real width
  }, []);

  function dayIdxFromClientX(clientX: number): number {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return clampIdx(Math.floor((clientX - rect.left + el.scrollLeft) / DAY_WIDTH));
  }

  function dateAtIdx(idx: number): string {
    return dateKey(addDays(domainStart, idx));
  }

  function scrollForward() {
    scrollRef.current?.scrollBy({ left: 7 * DAY_WIDTH, behavior: "smooth" });
  }

  // --- Header drag-to-pan (month row / day row) — no hold-to-create here,
  // just panning, since creating a block only makes sense on a pillar row.
  const panRef = useRef<{ startX: number; scrollStartLeft: number; moved: boolean } | null>(null);
  function handleHeaderPointerDown(e: React.PointerEvent) {
    const el = scrollRef.current;
    if (!el) return;
    panRef.current = { startX: e.clientX, scrollStartLeft: el.scrollLeft, moved: false };
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function handleHeaderPointerMove(e: React.PointerEvent) {
    const ps = panRef.current;
    const el = scrollRef.current;
    if (!ps || !el) return;
    const dx = e.clientX - ps.startX;
    if (Math.abs(dx) > 2) ps.moved = true;
    el.scrollLeft = ps.scrollStartLeft - dx;
  }
  function handleHeaderPointerUp() {
    panRef.current = null;
  }

  // --- Row pointer state machine: undecided -> (scrolling | creating).
  const holdRef = useRef<{
    pillar: TacticPillar;
    startX: number;
    startY: number;
    scrollStartLeft: number;
    dayIdx: number;
    mode: "undecided" | "scrolling" | "creating";
    timer: number;
  } | null>(null);

  function makeRowPointerDown(pillar: TacticPillar) {
    return (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("[data-block]")) return;
      const el = scrollRef.current;
      if (!el) return;
      const dayIdx = dayIdxFromClientX(e.clientX);
      const timer = window.setTimeout(() => {
        const hs = holdRef.current;
        if (hs && hs.mode === "undecided") {
          hs.mode = "creating";
          setDraft({ pillar: hs.pillar, startIdx: hs.dayIdx, endIdx: hs.dayIdx });
        }
      }, HOLD_MS);
      holdRef.current = {
        pillar,
        startX: e.clientX,
        startY: e.clientY,
        scrollStartLeft: el.scrollLeft,
        dayIdx,
        mode: "undecided",
        timer,
      };
      (e.target as Element).setPointerCapture(e.pointerId);
    };
  }

  function handleRowPointerMove(e: React.PointerEvent) {
    const hs = holdRef.current;
    const el = scrollRef.current;
    if (!hs || !el) return;
    const dx = e.clientX - hs.startX;
    const dy = e.clientY - hs.startY;
    if (hs.mode === "undecided" && (Math.abs(dx) > HOLD_MOVE_THRESHOLD || Math.abs(dy) > HOLD_MOVE_THRESHOLD)) {
      window.clearTimeout(hs.timer);
      hs.mode = "scrolling";
    }
    if (hs.mode === "scrolling") {
      el.scrollLeft = hs.scrollStartLeft - dx;
    } else if (hs.mode === "creating") {
      const dayIdx = dayIdxFromClientX(e.clientX);
      setDraft((d) => (d ? { ...d, endIdx: Math.max(d.startIdx, dayIdx) } : d));
    }
  }

  function handleRowPointerUp() {
    const hs = holdRef.current;
    holdRef.current = null;
    if (!hs) return;
    window.clearTimeout(hs.timer);
    if (hs.mode === "creating") {
      setDraft((d) => {
        if (d) setAddModal(d);
        return null;
      });
    }
  }

  function handleCreated(item: BoardItem) {
    setItems((prev) => [...prev, item]);
    setAddModal(null);
    setDraft(null);
  }

  function handleEdited(item: BoardItem) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
    setEditingItem(null);
  }

  function handleDeleted(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSelectedId(null);
    void deleteCampaignBlock(id);
  }

  // --- Resize: drag a block's own left/right edge to change just that
  // side's date, independent of moving the whole thing.
  const resizeRef = useRef<{
    id: string;
    edge: "start" | "end";
    startX: number;
    startIdx: number;
    endIdx: number;
    pillar: TacticPillar;
  } | null>(null);
  const [resizeVisual, setResizeVisual] = useState<{ id: string; startIdx: number; endIdx: number } | null>(null);

  function makeResizePointerDown(b: Block, edge: "start" | "end") {
    return (e: React.PointerEvent) => {
      e.stopPropagation();
      resizeRef.current = { id: b.id, edge, startX: e.clientX, startIdx: b.startIdx, endIdx: b.endIdx, pillar: b.pillar as TacticPillar };
      (e.target as Element).setPointerCapture(e.pointerId);
    };
  }
  function handleResizePointerMove(e: React.PointerEvent) {
    const rs = resizeRef.current;
    if (!rs) return;
    const dayDelta = Math.round((e.clientX - rs.startX) / DAY_WIDTH);
    if (rs.edge === "start") {
      setResizeVisual({ id: rs.id, startIdx: clampIdx(Math.min(rs.startIdx + dayDelta, rs.endIdx)), endIdx: rs.endIdx });
    } else {
      setResizeVisual({ id: rs.id, startIdx: rs.startIdx, endIdx: clampIdx(Math.max(rs.endIdx + dayDelta, rs.startIdx)) });
    }
  }
  function handleResizePointerUp() {
    const rs = resizeRef.current;
    resizeRef.current = null;
    if (!rs || !resizeVisual) {
      setResizeVisual(null);
      return;
    }
    const { startIdx, endIdx } = resizeVisual;
    setResizeVisual(null);
    const startDate = dateAtIdx(startIdx);
    const endDate = dateAtIdx(endIdx);
    setItems((prev) =>
      prev.map((i) => (i.id === rs.id ? { ...i, campaign_start_date: startDate, campaign_end_date: endDate } : i))
    );
    void updateCampaignBlock(rs.id, undefined, rs.pillar, startDate, endDate);
  }

  // --- Move: drag the block's own body to shift it in time and/or to a
  // different pillar row. wasMovingRef mirrors the same
  // capture-before-clearing trick CampaignTimeline's dot drag uses, so a
  // drag-then-release doesn't also register as the click that opens the
  // edit/delete footer.
  const moveRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    startIdx: number;
    endIdx: number;
    moved: boolean;
  } | null>(null);
  const wasMovingRef = useRef(false);
  const [moveVisual, setMoveVisual] = useState<{ id: string; startIdx: number; endIdx: number; pillar: TacticPillar } | null>(
    null
  );

  function makeBlockPointerDown(b: Block) {
    return (e: React.PointerEvent) => {
      e.stopPropagation();
      moveRef.current = { id: b.id, startX: e.clientX, startY: e.clientY, startIdx: b.startIdx, endIdx: b.endIdx, moved: false };
      (e.target as Element).setPointerCapture(e.pointerId);
    };
  }
  function handleBlockPointerMove(e: React.PointerEvent) {
    const ms = moveRef.current;
    if (!ms) return;
    const dx = e.clientX - ms.startX;
    const dy = e.clientY - ms.startY;
    if (!ms.moved && (Math.abs(dx) > DRAG_MOVE_THRESHOLD || Math.abs(dy) > DRAG_MOVE_THRESHOLD)) ms.moved = true;
    if (!ms.moved) return;
    const dayDelta = Math.round(dx / DAY_WIDTH);
    const duration = ms.endIdx - ms.startIdx;
    const newStart = clampIdx(ms.startIdx + dayDelta);
    const newEnd = clampIdx(newStart + duration);
    setMoveVisual((prev) => ({
      id: ms.id,
      startIdx: newStart,
      endIdx: newEnd,
      pillar: pillarFromClientY(e.clientY, prev?.id === ms.id ? prev.pillar : undefined),
    }));
  }
  function handleBlockPointerUp(b: Block) {
    return () => {
      const ms = moveRef.current;
      // onLostPointerCapture fires right after a plain onPointerUp too (a
      // normal release ends capture as well) — without this guard, that
      // redundant second call would find moveRef already cleared and stomp
      // wasMovingRef back to false right before the click fires, letting a
      // real drag still reopen the select footer.
      if (!ms) return;
      moveRef.current = null;
      wasMovingRef.current = ms.moved;
      if (!ms.moved || !moveVisual) {
        setMoveVisual(null);
        return;
      }
      const { startIdx, endIdx, pillar } = moveVisual;
      setMoveVisual(null);
      const startDate = dateAtIdx(startIdx);
      const endDate = dateAtIdx(endIdx);
      setItems((prev) =>
        prev.map((i) =>
          i.id === b.id ? { ...i, pillar, campaign_start_date: startDate, campaign_end_date: endDate } : i
        )
      );
      void updateCampaignBlock(b.id, undefined, pillar, startDate, endDate);
    };
  }

  const selectedBlock = items.find((i) => i.id === selectedId) ?? null;
  const movingBlockData = moveVisual ? items.find((i) => i.id === moveVisual.id) : null;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex overflow-hidden"
        style={{
          border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
          borderRadius: "var(--card-radius, 12px)",
          backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
        }}
      >
        <div className="flex shrink-0 flex-col border-r border-white/10" style={{ width: LABEL_WIDTH }}>
          <div
            className="flex items-end border-b border-white/10 px-3 pb-2 text-[10px] font-semibold uppercase tracking-wide text-white/40"
            style={{ height: HEADER_TOTAL_HEIGHT }}
          >
            Pillar
          </div>
          {TACTIC_PILLARS.map((p) => (
            <div
              key={p.value}
              className="flex flex-col justify-center gap-1 border-b border-white/10 px-3"
              style={{ height: rowHeight(p.value), transition: ROW_HEIGHT_TRANSITION }}
            >
              <span className="text-sm font-semibold text-white/90">{p.label}</span>
              <button
                type="button"
                onClick={() => setAddModal({ pillar: p.value, startIdx: todayIdx, endIdx: todayIdx })}
                className="w-fit text-[10px] text-white/40 transition-colors hover:text-white/80"
              >
                + Add block
              </button>
            </div>
          ))}
        </div>

        <div ref={scrollRef} className="relative flex-1 touch-none select-none overflow-x-auto [scrollbar-width:thin]">
          <div className="relative" style={{ width: totalWidth }}>
            <div
              className="absolute inset-y-0 z-10 w-px bg-[var(--accent)]"
              style={{ left: todayIdx * DAY_WIDTH + DAY_WIDTH / 2 }}
            />

            <div
              className="flex cursor-grab border-b border-white/10 active:cursor-grabbing"
              style={{ height: HEADER_MONTH_HEIGHT }}
              onPointerDown={handleHeaderPointerDown}
              onPointerMove={handleHeaderPointerMove}
              onPointerUp={handleHeaderPointerUp}
              onPointerLeave={handleHeaderPointerUp}
            >
              {monthGroups.map((g, i) => (
                <div
                  key={i}
                  className="shrink-0 truncate border-r border-white/5 px-2 text-xs font-semibold text-white/70"
                  style={{ width: g.dayCount * DAY_WIDTH }}
                >
                  {g.label}
                </div>
              ))}
            </div>

            <div
              className="flex cursor-grab border-b border-white/10 active:cursor-grabbing"
              style={{ height: HEADER_DAY_HEIGHT }}
              onPointerDown={handleHeaderPointerDown}
              onPointerMove={handleHeaderPointerMove}
              onPointerUp={handleHeaderPointerUp}
              onPointerLeave={handleHeaderPointerUp}
            >
              {days.map((d, i) => (
                <div
                  key={i}
                  className="flex shrink-0 flex-col items-center justify-center gap-0.5 border-r border-white/5 text-[10px]"
                  style={{ width: DAY_WIDTH }}
                >
                  <span className="uppercase text-white/35">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                  <span className="font-semibold text-white/70">{d.getDate()}</span>
                </div>
              ))}
            </div>

            {TACTIC_PILLARS.map((p) => (
              <div
                key={p.value}
                className="relative border-b border-white/10 last:border-b-0"
                style={{
                  height: rowHeight(p.value),
                  transition: ROW_HEIGHT_TRANSITION,
                  backgroundImage: `repeating-linear-gradient(to right, transparent, transparent ${DAY_WIDTH - 1}px, rgba(255,255,255,0.04) ${DAY_WIDTH - 1}px, rgba(255,255,255,0.04) ${DAY_WIDTH}px)`,
                }}
                onPointerDown={makeRowPointerDown(p.value)}
                onPointerMove={handleRowPointerMove}
                onPointerUp={handleRowPointerUp}
                onPointerLeave={handleRowPointerUp}
              >
                {blocksByPillar[p.value]
                  .map((b) => {
                    const resized = resizeVisual?.id === b.id ? resizeVisual : null;
                    const startIdx = resized?.startIdx ?? b.startIdx;
                    const endIdx = resized?.endIdx ?? b.endIdx;
                    // Being moved right now: hidden (the floating clone below
                    // stands in for it) but never removed from the DOM — this
                    // element is what's holding pointer capture for the drag,
                    // so unmounting it (the old `.filter()` approach) silently
                    // killed capture and dropped every event after the first
                    // pointermove, leaving the drag stuck forever with no
                    // pointerup ever arriving to settle it back into place.
                    const isBeingMoved = moveVisual?.id === b.id;
                    return (
                      <div
                        key={b.id}
                        data-block
                        className="group absolute flex items-center rounded-md text-xs font-medium text-black shadow-sm transition-[box-shadow,transform] hover:shadow-lg"
                        style={{
                          left: startIdx * DAY_WIDTH + 2,
                          width: (endIdx - startIdx + 1) * DAY_WIDTH - 4,
                          top: ROW_PADDING + b.lane * (LANE_HEIGHT + LANE_GAP),
                          height: LANE_HEIGHT,
                          backgroundColor: "var(--accent)",
                          opacity: isBeingMoved ? 0 : 1,
                          transition: resized ? "none" : "left 200ms ease, width 200ms ease, top 200ms ease",
                        }}
                      >
                        <button
                          type="button"
                          onPointerDown={makeBlockPointerDown(b)}
                          onPointerMove={handleBlockPointerMove}
                          onPointerUp={handleBlockPointerUp(b)}
                          onLostPointerCapture={handleBlockPointerUp(b)}
                          onClick={() => {
                            if (wasMovingRef.current) {
                              wasMovingRef.current = false;
                              return;
                            }
                            setSelectedId(b.id);
                          }}
                          className="min-w-0 flex-1 cursor-grab truncate px-2 text-left active:cursor-grabbing"
                        >
                          {b.title}
                        </button>
                        <div
                          onPointerDown={makeResizePointerDown(b, "start")}
                          onPointerMove={handleResizePointerMove}
                          onPointerUp={handleResizePointerUp}
                          onLostPointerCapture={handleResizePointerUp}
                          className="absolute inset-y-0 left-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100"
                          style={{ borderLeft: "2px solid rgba(0,0,0,0.4)" }}
                        />
                        <div
                          onPointerDown={makeResizePointerDown(b, "end")}
                          onPointerMove={handleResizePointerMove}
                          onPointerUp={handleResizePointerUp}
                          onLostPointerCapture={handleResizePointerUp}
                          className="absolute inset-y-0 right-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100"
                          style={{ borderRight: "2px solid rgba(0,0,0,0.4)" }}
                        />
                      </div>
                    );
                  })}

                {draft && draft.pillar === p.value && (
                  <div
                    className="absolute flex items-center rounded-md border-2 border-dashed px-2 text-xs font-medium"
                    style={{
                      left: draft.startIdx * DAY_WIDTH + 2,
                      width: (draft.endIdx - draft.startIdx + 1) * DAY_WIDTH - 4,
                      top: ROW_PADDING,
                      height: LANE_HEIGHT,
                      borderColor: "var(--accent)",
                      color: "var(--accent)",
                    }}
                  >
                    New block…
                  </div>
                )}
              </div>
            ))}

            {moveVisual && movingBlockData && (
              <div
                className="pointer-events-none absolute z-30 flex scale-105 items-center truncate rounded-md px-2 text-xs font-medium text-black shadow-2xl"
                style={{
                  left: moveVisual.startIdx * DAY_WIDTH + 2,
                  width: (moveVisual.endIdx - moveVisual.startIdx + 1) * DAY_WIDTH - 4,
                  top: HEADER_TOTAL_HEIGHT + rowTops[moveVisual.pillar] + ROW_PADDING,
                  height: LANE_HEIGHT,
                  backgroundColor: "var(--accent)",
                  transition: "top 140ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                {movingBlockData.title}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[10px] text-white/30">
          Swipe, grab the timeline, or grab the months to scroll — hold a row for 1s to draft a block, drag a
          block to move it, or drag its edge to resize.
        </p>
        <button
          type="button"
          onClick={scrollForward}
          aria-label="Scroll forward"
          className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3" aria-hidden>
            <path d="m7.5 5.5 5 4.5-5 4.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {addModal && (
        <BlockFormModal
          artistId={artistId}
          pillar={addModal.pillar}
          initialName=""
          initialStartDate={dateAtIdx(addModal.startIdx)}
          initialEndDate={dateAtIdx(addModal.endIdx)}
          onClose={() => {
            setAddModal(null);
            setDraft(null);
          }}
          onSaved={handleCreated}
        />
      )}

      {editingItem && editingItem.campaign_start_date && editingItem.campaign_end_date && (
        <BlockFormModal
          artistId={artistId}
          editingId={editingItem.id}
          pillar={editingItem.pillar as TacticPillar}
          initialName={editingItem.title}
          initialStartDate={editingItem.campaign_start_date}
          initialEndDate={editingItem.campaign_end_date}
          onClose={() => setEditingItem(null)}
          onSaved={handleEdited}
        />
      )}

      {selectedBlock && (
        <div
          className="flex items-center justify-between gap-3 p-3.5"
          style={{
            backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
            border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
            borderRadius: "var(--card-radius, 12px)",
          }}
        >
          <div>
            <p className="text-sm font-medium text-white/90">{selectedBlock.title}</p>
            <p className="text-xs text-white/40">
              {TACTIC_PILLARS.find((p) => p.value === selectedBlock.pillar)?.label} ·{" "}
              {selectedBlock.campaign_start_date} → {selectedBlock.campaign_end_date}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="rounded-full px-3 py-1 text-xs text-white/50 hover:text-white/80"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingItem(selectedBlock);
                setSelectedId(null);
              }}
              className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/50 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => handleDeleted(selectedBlock.id)}
              className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/50 transition-colors hover:border-red-400/40 hover:text-red-300"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function assignLanes(blocks: Block[]): Block[] {
  const sorted = [...blocks].sort((a, b) => a.startIdx - b.startIdx);
  const laneEnds: number[] = [];
  const withLanes = sorted.map((b) => {
    let lane = laneEnds.findIndex((end) => end < b.startIdx);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(b.endIdx);
    } else {
      laneEnds[lane] = b.endIdx;
    }
    return { ...b, lane };
  });
  return withLanes;
}

/** Doubles as both "Add a block" (no editingId) and "Edit block"
 * (editingId set) — same fields either way, just a different verb and
 * server action underneath. */
function BlockFormModal({
  artistId,
  editingId,
  pillar,
  initialName,
  initialStartDate,
  initialEndDate,
  onClose,
  onSaved,
}: {
  artistId: string;
  editingId?: string;
  pillar: TacticPillar;
  initialName: string;
  initialStartDate: string;
  initialEndDate: string;
  onClose: () => void;
  onSaved: (item: BoardItem) => void;
}) {
  const { closing, requestClose } = useClosableOverlay(onClose);
  const [name, setName] = useState(initialName);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pillarLabel = TACTIC_PILLARS.find((p) => p.value === pillar)?.label ?? pillar;
  const isEditing = !!editingId;

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    const result = isEditing
      ? await updateCampaignBlock(editingId!, name, pillar, startDate, endDate)
      : await addCampaignBlock(artistId, pillar, name, startDate, endDate);
    setSaving(false);
    if (result.ok) onSaved(result.item);
    else setError(result.error);
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={requestClose}>
      <div
        className={`w-full max-w-sm rounded-xl border border-white/10 bg-neutral-950 p-5 shadow-2xl ${
          closing ? "animate-modal-out" : "animate-modal-in"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-white">
          {isEditing ? "Edit block" : "Add a block"} — {pillarLabel}
        </p>

        <label className="mt-3 flex flex-col gap-1 text-xs text-white/50">
          Name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Teaser video rollout"
            className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm text-white placeholder-white/30 focus:border-[var(--accent)] focus:outline-none"
          />
        </label>

        <div className="mt-3 flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-xs text-white/50">
            Starts
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm text-white focus:border-[var(--accent)] focus:outline-none"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-white/50">
            Ends
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm text-white focus:border-[var(--accent)] focus:outline-none"
            />
          </label>
        </div>

        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={requestClose} className="rounded-full px-3 py-1.5 text-xs text-white/50 hover:text-white/80">
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || saving}
            onClick={() => void handleSave()}
            className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-40"
          >
            {saving ? "Saving…" : isEditing ? "Save changes" : "Add block"}
          </button>
        </div>
      </div>
    </div>
  );
}
