"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useClosableOverlay } from "@/hooks/useClosableOverlay";
import { addCampaignBlock, deleteCampaignBlock } from "@/app/s/[slug]/campaignBlockActions";
import { TACTIC_PILLARS, type TacticPillar } from "@/lib/tacticFields";
import type { BoardItem } from "@/lib/database.types";

const DAY_WIDTH = 44;
const LABEL_WIDTH = 108;
const HEADER_MONTH_HEIGHT = 28;
const HEADER_DAY_HEIGHT = 40;
const LANE_HEIGHT = 28;
const LANE_GAP = 6;
const ROW_PADDING = 10;
const DOMAIN_BEFORE_DAYS = 14;
const DOMAIN_TOTAL_DAYS = 300;
const HOLD_MS = 3000;
const HOLD_MOVE_THRESHOLD = 6;
const TODAY_FRACTION = 1 / 6;

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
 * three fixed pillar rows on a scrollable day-by-day strip, alongside
 * (not replacing) the existing tour-dates month grid above it. Backed by
 * the same `board_items` rows the Tactics tab already uses (pillar +
 * campaign_start_date/end_date), so a block created here is also a tactic
 * card there, and vice versa.
 *
 * Three ways to add a block: the "+ Add block" button under each row's
 * label (opens the named modal directly); holding the pointer stationary
 * on an empty stretch of a row for ~3 seconds, which drops a draft block
 * anchored at that day and lets you drag to extend its end date before
 * naming it; or just dragging normally, which pans the timeline instead
 * (the hold has to stay still — any real movement before it fires is
 * read as "pan", not "create"). */
export function CampaignGanttBoard({
  artistId,
  initialBlocks,
}: {
  artistId: string;
  initialBlocks: BoardItem[];
}) {
  const [items, setItems] = useState(initialBlocks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  function handleDeleted(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSelectedId(null);
    void deleteCampaignBlock(id);
  }

  const selectedBlock = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex overflow-hidden"
        style={{
          border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
          borderRadius: "var(--card-radius, 12px)",
          backgroundColor: "rgba(0,0,0,0.4)",
        }}
      >
        <div className="flex shrink-0 flex-col border-r border-white/10" style={{ width: LABEL_WIDTH }}>
          <div
            className="flex items-end border-b border-white/10 px-3 pb-2 text-[10px] font-semibold uppercase tracking-wide text-white/40"
            style={{ height: HEADER_MONTH_HEIGHT + HEADER_DAY_HEIGHT }}
          >
            Pillar
          </div>
          {TACTIC_PILLARS.map((p) => (
            <div
              key={p.value}
              className="flex flex-col justify-center gap-1 border-b border-white/10 px-3"
              style={{ height: rowHeight(p.value) }}
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
                  backgroundImage: `repeating-linear-gradient(to right, transparent, transparent ${DAY_WIDTH - 1}px, rgba(255,255,255,0.04) ${DAY_WIDTH - 1}px, rgba(255,255,255,0.04) ${DAY_WIDTH}px)`,
                }}
                onPointerDown={makeRowPointerDown(p.value)}
                onPointerMove={handleRowPointerMove}
                onPointerUp={handleRowPointerUp}
                onPointerLeave={handleRowPointerUp}
              >
                {blocksByPillar[p.value].map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    data-block
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(b.id);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="absolute flex items-center truncate rounded-md px-2 text-xs font-medium text-black shadow-sm transition-transform hover:-translate-y-0.5"
                    style={{
                      left: b.startIdx * DAY_WIDTH + 2,
                      width: (b.endIdx - b.startIdx + 1) * DAY_WIDTH - 4,
                      top: ROW_PADDING + b.lane * (LANE_HEIGHT + LANE_GAP),
                      height: LANE_HEIGHT,
                      backgroundColor: "var(--accent)",
                    }}
                  >
                    {b.title}
                  </button>
                ))}

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
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[10px] text-white/30">
          Swipe, grab the timeline, or grab the months to scroll — hold a row for 3s to draft a block by hand.
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
        <AddBlockModal
          artistId={artistId}
          pillar={addModal.pillar}
          initialStartDate={dateAtIdx(addModal.startIdx)}
          initialEndDate={dateAtIdx(addModal.endIdx)}
          onClose={() => {
            setAddModal(null);
            setDraft(null);
          }}
          onCreated={handleCreated}
        />
      )}

      {selectedBlock && (
        <div
          className="flex items-center justify-between gap-3 p-3.5"
          style={{
            backgroundColor: "rgba(0,0,0,0.4)",
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

function AddBlockModal({
  artistId,
  pillar,
  initialStartDate,
  initialEndDate,
  onClose,
  onCreated,
}: {
  artistId: string;
  pillar: TacticPillar;
  initialStartDate: string;
  initialEndDate: string;
  onClose: () => void;
  onCreated: (item: BoardItem) => void;
}) {
  const { closing, requestClose } = useClosableOverlay(onClose);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pillarLabel = TACTIC_PILLARS.find((p) => p.value === pillar)?.label ?? pillar;

  async function handleCreate() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    const result = await addCampaignBlock(artistId, pillar, name, startDate, endDate);
    setSaving(false);
    if (result.ok) onCreated(result.item);
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
        <p className="text-sm font-semibold text-white">Add a block — {pillarLabel}</p>

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
            onClick={() => void handleCreate()}
            className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-40"
          >
            {saving ? "Adding…" : "Add block"}
          </button>
        </div>
      </div>
    </div>
  );
}
