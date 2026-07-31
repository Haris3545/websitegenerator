"use client";

import { useState, useTransition } from "react";
import { KpiCard } from "@/components/site/KpiCard";
import { useEditMode } from "@/components/site/EditModeContext";
import { updateTabOrder, updateDashboardHiddenCards } from "@/app/s/[slug]/actions";
import { useDragReorder } from "@/hooks/useDragReorder";
import { RestoreDeletedPopover } from "@/components/site/RestoreDeletedPopover";
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

/** The Dashboard's KPI cards' order is just one rendering of the same
 * enabled_tabs order the nav pills use (see NavPills) — dragging a card
 * reorders that tab everywhere, permanently, the same way dragging a tab
 * pill does. Removing a card ("×") is deliberately NOT the same thing: it
 * only hides that card from the Dashboard (dashboard_hidden_cards), never
 * touching enabled_tabs, so the tab itself stays in the nav bar. A hidden
 * card can be brought back via "+ Widget". iOS-homescreen-style drag only
 * activates in edit mode; a plain click/tap never triggers it. */
export function DashboardKpiGrid({
  artistId,
  entries: allEntries,
  hiddenTabs: initialHiddenTabs,
}: {
  artistId: string;
  entries: KpiEntry[];
  hiddenTabs: TabKey[];
}) {
  const { editMode } = useEditMode();
  const [, startTransition] = useTransition();
  const [order, setOrder] = useState(allEntries.map((e) => e.tabKey));
  const [hiddenTabs, setHiddenTabs] = useState(initialHiddenTabs);

  const entryByTab = new Map(allEntries.map((e) => [e.tabKey, e]));
  const entries = order
    .filter((k) => !hiddenTabs.includes(k))
    .map((k) => entryByTab.get(k))
    .filter((e): e is KpiEntry => !!e);
  const hiddenEntries = hiddenTabs
    .map((k) => entryByTab.get(k))
    .filter((e): e is KpiEntry => !!e);

  function persistOrder(next: TabKey[]) {
    setOrder(next);
    startTransition(() => {
      updateTabOrder(artistId, next);
    });
  }

  const { draggingKey, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useDragReorder(
    (dragKey, overKey) => {
      if (!overKey || overKey === dragKey) return;
      const key = dragKey as TabKey;
      const rest = order.filter((k) => k !== key);
      if (!order.includes(key)) return;
      const insertAt = overKey === END ? rest.length : rest.findIndex((k) => k === overKey);
      rest.splice(insertAt < 0 ? rest.length : insertAt, 0, key);
      persistOrder(rest);
    }
  );

  function remove(tabKey: TabKey) {
    const next = [...hiddenTabs, tabKey];
    setHiddenTabs(next);
    startTransition(() => {
      updateDashboardHiddenCards(artistId, next);
    });
  }

  function restore(tabKey: string) {
    const next = hiddenTabs.filter((k) => k !== tabKey);
    setHiddenTabs(next);
    startTransition(() => {
      updateDashboardHiddenCards(artistId, next);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {editMode && (
        <div className="flex justify-end">
          <RestoreDeletedPopover
            items={hiddenEntries.map((e) => ({ id: e.tabKey, title: e.label }))}
            onRestore={restore}
            label={(count) => `+ Widget (${count})`}
            actionLabel="Add"
          />
        </div>
      )}
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
    </div>
  );
}
