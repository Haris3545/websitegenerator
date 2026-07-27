"use client";

import { useState } from "react";
import { useClosableOverlay } from "@/hooks/useClosableOverlay";
import type { BoardItem } from "@/lib/database.types";

const DRAG_UP_COMMIT_PX = 120;

function IdeaGridCard({
  item,
  selectMode,
  selected,
  jiggleDelay,
  faded,
  onTap,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  item: BoardItem;
  selectMode: boolean;
  selected: boolean;
  jiggleDelay: number;
  faded: boolean;
  onTap: () => void;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className={`relative aspect-[3/4] touch-none select-none overflow-hidden rounded-xl shadow-lg shadow-black/30 transition-opacity duration-150 ${
        selectMode && !faded ? "animate-jiggle" : ""
      } ${faded ? "opacity-25" : ""}`}
      style={{
        border: "1px solid rgba(255,255,255,0.12)",
        animationDelay: `${jiggleDelay}s`,
      }}
      onClick={onTap}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image_url} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-white/5 text-xs text-white/30">
          No image
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-3 pt-10">
        <p className="text-left text-sm font-semibold leading-tight text-white">{item.title}</p>
      </div>
      {selectMode && (
        <div
          className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs ${
            selected ? "border-[var(--accent)] bg-[var(--accent)] text-black" : "border-white/60 bg-black/30 text-transparent"
          }`}
        >
          ✓
        </div>
      )}
    </div>
  );
}

function IdeaDetailSheet({
  item,
  folder,
  onClose,
  onEdit,
  onDelete,
  onSchedule,
  onMove,
}: {
  item: BoardItem;
  folder: "liked" | "disliked";
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSchedule: () => void;
  onMove: (status: "pending" | "liked" | "disliked") => void;
}) {
  const { closing, requestClose } = useClosableOverlay(onClose);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={requestClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-white/15 bg-neutral-950 text-white shadow-2xl shadow-black/50 ${
          closing ? "animate-card-sheet-out" : "animate-card-sheet-in"
        }`}
      >
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-lg text-white/50 backdrop-blur-sm transition-opacity hover:bg-black/60 hover:text-white/90 hover:opacity-100"
        >
          ×
        </button>

        {item.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt="" className="h-40 w-full shrink-0 object-cover" />
        )}

        <div className="custom-scrollbar flex-1 overflow-y-auto p-5">
          <h3 className="pr-8 text-lg font-bold leading-tight">{item.title}</h3>
          {item.body && <p className="mt-2 text-sm leading-relaxed text-white/70">{item.body}</p>}
          {item.timeline && (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-wide text-white/40">Timeline / lead time</p>
              <p className="text-sm font-semibold text-white">{item.timeline}</p>
            </div>
          )}
          {item.calendar_status && (
            <p className="mt-3 text-xs text-[var(--accent)]">
              {item.calendar_status === "confirmed"
                ? `Scheduled — ${item.scheduled_date ?? "date set"}`
                : "On the calendar's to-be-confirmed stack"}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit idea"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/80 transition-colors hover:bg-white/10"
            >
              ✎
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete idea"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-red-500/40 text-red-400 transition-colors hover:bg-red-500/10"
            >
              🗑
            </button>
          </div>
          {folder === "liked" && (
            <button
              type="button"
              onClick={onSchedule}
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-black transition-transform hover:-translate-y-0.5"
            >
              Add to calendar
            </button>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 border-t border-white/10 px-4 py-2.5">
          <button
            type="button"
            onClick={() => onMove("pending")}
            className="rounded-full px-3 py-1 text-[11px] font-medium text-white/50 transition-colors hover:text-white"
          >
            Return to stack
          </button>
          <span className="text-white/20">·</span>
          <button
            type="button"
            onClick={() => onMove(folder === "liked" ? "disliked" : "liked")}
            className="rounded-full px-3 py-1 text-[11px] font-medium text-white/50 transition-colors hover:text-white"
          >
            Switch to {folder === "liked" ? "disliked" : "liked"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The full-screen grid for the Liked/Disliked folders. "Select" turns on
 * iOS-style jiggle mode: cards wobble, get a checkmark badge, and can be
 * bulk-moved back to the stack (or across to the other folder) either with
 * the bottom action bar or by dragging a card upward past the drop zone.
 * Dragging a card that's part of the current selection lifts the whole
 * selection together into a small floating stack that follows the pointer
 * — matching the iOS Photos "drag one, act on all selected" pattern —
 * while the source cards dim in place rather than each animating on their
 * own. */
export function IdeaFolderView({
  folder,
  items,
  onClose,
  onStatusChange,
  onEdit,
  onDelete,
  onSchedule,
}: {
  folder: "liked" | "disliked";
  items: BoardItem[];
  onClose: () => void;
  onStatusChange: (ids: string[], status: "pending" | "liked" | "disliked") => void;
  onEdit: (item: BoardItem) => void;
  onDelete: (item: BoardItem) => void;
  onSchedule: (item: BoardItem) => void;
}) {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewingItem, setViewingItem] = useState<BoardItem | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dragStarted, setDragStarted] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const { closing, requestClose } = useClosableOverlay(onClose);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCardTap(item: BoardItem) {
    if (draggedId) return;
    if (selectMode) {
      toggleSelect(item.id);
    } else {
      setViewingItem(item);
    }
  }

  function commitMove(ids: string[], status: "pending" | "liked" | "disliked") {
    onStatusChange(ids, status);
    setSelectedIds(new Set());
    setSelectMode(false);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>, id: string) {
    if (!selectMode || e.button !== 0) return;
    setDragStart({ x: e.clientX, y: e.clientY });
    setDragStarted(false);
    setDraggedId(id);
    setDragPos({ x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggedId) return;
    const dy = e.clientY - dragStart.y;
    if (!dragStarted && Math.abs(dy) > 6) setDragStarted(true);
    setDragPos({ x: e.clientX, y: e.clientY });
  }

  function endDrag() {
    if (!draggedId) return;
    const dy = dragPos.y - dragStart.y;
    const committed = dragStarted && dy <= -DRAG_UP_COMMIT_PX;
    if (committed) {
      const ids = selectedIds.has(draggedId) && selectedIds.size > 0 ? Array.from(selectedIds) : [draggedId];
      commitMove(ids, "pending");
    }
    setDraggedId(null);
    setDragStarted(false);
  }

  const isDraggingUp = draggedId !== null && dragStarted;
  const dragGroupIds =
    draggedId && selectedIds.has(draggedId) && selectedIds.size > 0 ? Array.from(selectedIds) : draggedId ? [draggedId] : [];
  const dragGroupItems = dragGroupIds.map((id) => items.find((i) => i.id === id)).filter((i): i is BoardItem => !!i);
  const dropProgress = isDraggingUp
    ? Math.min(1, Math.max(0, -(dragPos.y - dragStart.y) / DRAG_UP_COMMIT_PX))
    : 0;

  return (
    <div
      className={`fixed inset-0 z-[60] flex flex-col bg-neutral-950 ${closing ? "animate-sheet-out" : "animate-sheet-in"}`}
    >
      {/* A soft green glow that grows in from the top as the drag approaches
          the commit threshold, rather than a hard-edged solid bar. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center overflow-hidden transition-opacity duration-150"
        style={{
          height: 180,
          opacity: dropProgress,
          background: "radial-gradient(ellipse at top, rgba(52,211,153,0.55), transparent 70%)",
        }}
      >
        <span className="mt-6 text-sm font-bold uppercase tracking-wide text-emerald-300 drop-shadow-md">
          Drop here to send back to the stack
        </span>
      </div>

      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
        <button
          type="button"
          onClick={() => {
            setSelectMode((v) => !v);
            setSelectedIds(new Set());
          }}
          className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/80 transition-colors hover:bg-white/10"
        >
          {selectMode ? "Done" : "Select"}
        </button>
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-white">
            {folder === "liked" ? "Liked ideas" : "Disliked ideas"} <span className="text-white/40">({items.length})</span>
          </p>
          {selectMode && (
            <p className="text-xs text-white/40">
              {selectedIds.size === 0 ? "Tap cards to select" : `${selectedIds.size} selected`}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-full text-xl text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          ×
        </button>
      </div>

      {selectMode && (
        <div className="flex shrink-0 items-center gap-3 px-5 py-2">
          <button
            type="button"
            onClick={() =>
              setSelectedIds((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))))
            }
            className="text-xs font-medium text-white/60 underline-offset-2 hover:text-white hover:underline"
          >
            {selectedIds.size === items.length ? "Deselect all" : "Select all"}
          </button>
        </div>
      )}

      <div className="custom-scrollbar flex-1 overflow-y-auto px-5 pb-28 pt-2">
        {items.length === 0 ? (
          <p className="mt-10 text-center text-sm text-white/40">Nothing here yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {items.map((item, i) => (
              <IdeaGridCard
                key={item.id}
                item={item}
                selectMode={selectMode}
                selected={selectedIds.has(item.id)}
                jiggleDelay={(i % 5) * -0.045}
                faded={dragStarted && dragGroupIds.includes(item.id)}
                onTap={() => handleCardTap(item)}
                onPointerDown={(e) => handlePointerDown(e, item.id)}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
            ))}
          </div>
        )}
      </div>

      {/* The dragged card(s) render here as a fixed-position group that
          follows the pointer, rather than each grid card animating on its
          own — dragging one selected card lifts the whole selection. */}
      {draggedId && dragStarted && (
        <div className="pointer-events-none fixed z-[70]" style={{ left: dragPos.x, top: dragPos.y }}>
          {dragGroupItems.slice(0, 3).map((item, i) => (
            <div
              key={item.id}
              className="absolute h-24 w-20 overflow-hidden rounded-lg border border-white/25 shadow-2xl shadow-black/60"
              style={{
                transform: `translate(-50%, -50%) rotate(${(i - 1) * 6}deg)`,
                zIndex: 3 - i,
              }}
            >
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-neutral-800" />
              )}
            </div>
          ))}
          {dragGroupItems.length > 1 && (
            <span
              className="absolute flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-[11px] font-bold text-black shadow-lg"
              style={{ transform: "translate(6px, -28px)" }}
            >
              {dragGroupItems.length}
            </span>
          )}
        </div>
      )}

      {selectMode && selectedIds.size > 0 && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 border-t border-white/10 bg-neutral-950/95 p-4 backdrop-blur-md">
          <button
            type="button"
            onClick={() => commitMove(Array.from(selectedIds), "pending")}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-white/10"
          >
            Return {selectedIds.size} to stack
          </button>
          <button
            type="button"
            onClick={() => commitMove(Array.from(selectedIds), folder === "liked" ? "disliked" : "liked")}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-black transition-transform hover:-translate-y-0.5"
          >
            Switch {selectedIds.size} to {folder === "liked" ? "disliked" : "liked"}
          </button>
        </div>
      )}

      {viewingItem && (
        <IdeaDetailSheet
          item={viewingItem}
          folder={folder}
          onClose={() => setViewingItem(null)}
          onEdit={() => {
            onEdit(viewingItem);
            setViewingItem(null);
          }}
          onDelete={() => {
            onDelete(viewingItem);
            setViewingItem(null);
          }}
          onSchedule={() => {
            onSchedule(viewingItem);
            setViewingItem(null);
          }}
          onMove={(status) => {
            commitMove([viewingItem.id], status);
            setViewingItem(null);
          }}
        />
      )}
    </div>
  );
}
