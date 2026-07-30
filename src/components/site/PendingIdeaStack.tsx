"use client";

import { useRef, useState, useTransition } from "react";
import { ScheduleModal } from "@/components/site/ideas/ScheduleModal";
import { scheduleIdeaToCalendar, unscheduleIdeaFromCalendar } from "@/app/s/[slug]/actions";
import type { ArtistEvent, BoardItem } from "@/lib/database.types";

const DRAG_THRESHOLD_PX = 6;

function dayKeyToISODate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The small "to be confirmed" stack at the bottom of the Calendar tab —
 * ideas from the Liked folder that got "Add to calendar" but no firm
 * date/time yet (see ScheduleModal.tsx). A plain tap reopens the same
 * scheduling prompt; dragging a card (same tilt-and-follow feel as the
 * Ideas tab's swipe cards) onto a day cell in the month grid above locks
 * it straight onto that date instead. The × removes the "add to calendar"
 * entirely — for when that button gets tapped by accident — without
 * touching the idea itself, which stays in Liked. */
export function PendingIdeaStack({
  artistId,
  slug,
  items,
  onHoverDayChange,
  onScheduled,
}: {
  artistId: string;
  slug: string;
  items: BoardItem[];
  onHoverDayChange: (dayKey: string | null) => void;
  onScheduled: (event: ArtistEvent) => void;
}) {
  const [pending, setPending] = useState(items);
  const [editing, setEditing] = useState<BoardItem | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dragStarted, setDragStarted] = useState(false);
  const [pivot, setPivot] = useState(1);
  const [, startTransition] = useTransition();
  const hoverKeyRef = useRef<string | null>(null);

  if (pending.length === 0) return null;

  const draggedItem = pending.find((i) => i.id === dragId) ?? null;

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>, item: BoardItem) {
    if (e.button !== 0) return;
    setDragStart({ x: e.clientX, y: e.clientY });
    hoverKeyRef.current = null;
    setDragId(item.id);
    setDragStarted(false);
    setDragPos({ x: e.clientX, y: e.clientY });
    const rect = e.currentTarget.getBoundingClientRect();
    setPivot((e.clientY - rect.top) / rect.height < 0.5 ? -1 : 1);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragId) return;
    if (!dragStarted && Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) >= DRAG_THRESHOLD_PX) {
      setDragStarted(true);
    }
    setDragPos({ x: e.clientX, y: e.clientY });
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-calendar-day]");
    const key = target?.dataset.calendarDay ?? null;
    if (key !== hoverKeyRef.current) {
      hoverKeyRef.current = key;
      onHoverDayChange(key);
    }
  }

  function handlePointerUp(item: BoardItem) {
    const wasDrag = dragStarted;
    const hoverKey = hoverKeyRef.current;
    hoverKeyRef.current = null;
    setDragId(null);
    setDragStarted(false);
    onHoverDayChange(null);

    if (!wasDrag) {
      setEditing(item);
      return;
    }
    if (!hoverKey) return;

    const date = dayKeyToISODate(hoverKey);
    startTransition(async () => {
      const result = await scheduleIdeaToCalendar(item.id, artistId, slug, { date, time: "", tbc: false });
      if (result.ok) {
        setPending((prev) => prev.filter((i) => i.id !== item.id));
        if (result.event) onScheduled(result.event);
      }
    });
  }

  function handleRemove(item: BoardItem) {
    setPending((prev) => prev.filter((i) => i.id !== item.id));
    startTransition(() => {
      unscheduleIdeaFromCalendar(item.id, slug);
    });
  }

  return (
    <div className="mt-2">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-white/70">
        <span className="h-3 w-1 bg-white/30" />
        Ideas — to be confirmed
      </h3>
      <p className="mb-3 text-xs text-white/40">Drag a card onto a date above to lock it in.</p>
      <div className="flex flex-wrap gap-3">
        {pending.map((item) => {
          const isBeingDragged = dragId === item.id && dragStarted;
          return (
            <div
              key={item.id}
              className={`relative w-36 shrink-0 touch-none select-none overflow-hidden rounded-xl border border-white/15 bg-white/5 text-left shadow-lg shadow-black/20 transition-[transform,opacity] duration-150 ease-out ${
                isBeingDragged ? "opacity-30" : "cursor-grab [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-0.5 active:cursor-grabbing"
              }`}
              onPointerDown={(e) => handlePointerDown(e, item)}
              onPointerMove={handlePointerMove}
              onPointerUp={() => handlePointerUp(item)}
              onPointerCancel={() => handlePointerUp(item)}
            >
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image_url} alt="" className="h-20 w-full object-cover" draggable={false} />
              ) : (
                <div className="flex h-20 w-full items-center justify-center bg-white/5 text-[10px] text-white/30">
                  No image
                </div>
              )}
              <div className="p-2">
                <p className="truncate text-xs font-semibold text-white">{item.title}</p>
                <p className="text-[10px] uppercase tracking-wide text-[var(--accent)]">To be confirmed</p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(item);
                }}
                aria-label="Remove from calendar"
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-sm text-white/70 backdrop-blur-sm transition-colors hover:bg-red-500 hover:text-white"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {draggedItem && dragStarted && (
        <div
          className="pointer-events-none fixed left-0 top-0 z-[90] w-32 overflow-hidden rounded-xl border border-white/20 bg-neutral-900 shadow-2xl shadow-black/60"
          style={{
            transform: `translate(${dragPos.x - 64}px, ${dragPos.y - 40}px) rotate(${((dragPos.x - dragStart.x) / 18) * pivot}deg)`,
          }}
        >
          {draggedItem.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draggedItem.image_url} alt="" className="h-16 w-full object-cover" />
          ) : (
            <div className="flex h-16 w-full items-center justify-center bg-white/5 text-[10px] text-white/30">
              No image
            </div>
          )}
          <p className="truncate p-1.5 text-[11px] font-semibold text-white">{draggedItem.title}</p>
        </div>
      )}

      {editing && (
        <ScheduleModal
          artistId={artistId}
          slug={slug}
          item={editing}
          onClose={() => setEditing(null)}
          onScheduled={({ calendar_status, event }) => {
            if (calendar_status === "confirmed") {
              setPending((prev) => prev.filter((i) => i.id !== editing.id));
              if (event) onScheduled(event);
            } else {
              setPending((prev) => prev.map((i) => (i.id === editing.id ? { ...i, calendar_status } : i)));
            }
          }}
        />
      )}
    </div>
  );
}
