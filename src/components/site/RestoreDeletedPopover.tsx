"use client";

import { useState } from "react";

type DeletableItem = { id: string; title: string };

/** A small "↺ Restore" entry point next to a board's "+ New X" button —
 * lists cards that have been deleted (soft-deleted, see 042_board_items_
 * soft_delete.sql) so any of them can be brought back later, not just
 * within a brief undo window right after deleting. */
export function RestoreDeletedPopover<T extends DeletableItem>({
  items,
  onRestore,
}: {
  items: T[];
  onRestore: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/60 transition-colors hover:border-white/30 hover:text-white"
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden>
          <path
            d="M4 4v4h4M4.5 12a6 6 0 1 0 1.5-5.5L4 8"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Restore ({items.length})
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="animate-poof-in absolute left-0 top-full z-30 mt-2 max-h-72 w-64 origin-top-left overflow-y-auto custom-scrollbar rounded-xl border border-white/10 bg-neutral-950/95 p-1.5 shadow-2xl backdrop-blur-md">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onRestore(item.id);
                  if (items.length === 1) setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-white/70 transition-colors hover:bg-white/5 hover:text-white"
              >
                <span className="truncate">{item.title || "Untitled"}</span>
                <span className="shrink-0 font-semibold text-[var(--accent)]">Restore</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
