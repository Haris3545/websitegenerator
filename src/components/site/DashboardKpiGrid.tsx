"use client";

import { useState, useTransition } from "react";
import { KpiCard } from "@/components/site/KpiCard";
import { useEditMode } from "@/components/site/EditModeContext";
import { updateTabOrder } from "@/app/s/[slug]/actions";
import { useDragReorder } from "@/hooks/useDragReorder";
import type { TabKey } from "@/lib/database.types";

const END = "__end__";

export type KpiEntry = {
  tabKey: TabKey;
  label: string;
  value: string;
  caption: string;
  trend: string | null;
  color: string;
};

/** The Dashboard's KPI cards are just one rendering of the same
 * enabled_tabs order the nav pills use (see NavPills) — dragging a card
 * here or removing it (the "×") reorders/hides that tab everywhere,
 * permanently, the same way dragging a tab pill does. iOS-homescreen-style
 * drag only activates in edit mode; a plain click/tap never triggers it. */
export function DashboardKpiGrid({
  artistId,
  entries: initialEntries,
}: {
  artistId: string;
  entries: KpiEntry[];
}) {
  const { editMode } = useEditMode();
  const [, startTransition] = useTransition();
  const [entries, setEntries] = useState(initialEntries);

  function persist(next: KpiEntry[]) {
    setEntries(next);
    startTransition(() => {
      updateTabOrder(artistId, next.map((e) => e.tabKey));
    });
  }

  const { draggingKey, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useDragReorder(
    (dragKey, overKey) => {
      if (!overKey || overKey === dragKey) return;
      const rest = entries.filter((e) => e.tabKey !== dragKey);
      const dragged = entries.find((e) => e.tabKey === dragKey);
      if (!dragged) return;
      const insertAt = overKey === END ? rest.length : rest.findIndex((e) => e.tabKey === overKey);
      rest.splice(insertAt < 0 ? rest.length : insertAt, 0, dragged);
      persist(rest);
    }
  );

  function remove(tabKey: TabKey) {
    persist(entries.filter((e) => e.tabKey !== tabKey));
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {entries.map((entry) => (
        <div
          key={entry.tabKey}
          data-reorder-key={entry.tabKey}
          onPointerDown={editMode ? (e) => handlePointerDown(e, entry.tabKey) : undefined}
          onPointerMove={editMode ? handlePointerMove : undefined}
          onPointerUp={editMode ? handlePointerUp : undefined}
          onPointerCancel={editMode ? handlePointerCancel : undefined}
          className={
            editMode
              ? `relative touch-none cursor-grab select-none active:cursor-grabbing ${
                  draggingKey === entry.tabKey ? "opacity-40" : ""
                }`
              : "relative"
          }
          style={editMode ? { touchAction: "none" } : undefined}
        >
          {editMode && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => remove(entry.tabKey)}
              aria-label={`Remove ${entry.label} card`}
              className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold leading-none text-white shadow-lg hover:bg-red-400"
            >
              ×
            </button>
          )}
          <KpiCard
            label={entry.label}
            value={entry.value}
            caption={entry.caption}
            trend={entry.trend}
            color={entry.color}
          />
        </div>
      ))}
      {editMode && (
        <div
          data-reorder-key={END}
          className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-white/20 text-center text-xs text-white/30"
        >
          Drag cards to reorder · × to remove
        </div>
      )}
    </div>
  );
}
