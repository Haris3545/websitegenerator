"use client";

import { useState } from "react";
import { ScheduleModal } from "@/components/site/ideas/ScheduleModal";
import type { BoardItem } from "@/lib/database.types";

/** The small "to be confirmed" stack at the bottom of the Calendar tab —
 * ideas from the Liked folder that got "Add to calendar" but no firm
 * date/time yet (see ScheduleModal.tsx). Tapping one reopens the same
 * scheduling prompt so it can be locked in (moving it onto the real month
 * grid) or left as-is. */
export function PendingIdeaStack({
  artistId,
  slug,
  items,
}: {
  artistId: string;
  slug: string;
  items: BoardItem[];
}) {
  const [pending, setPending] = useState(items);
  const [editing, setEditing] = useState<BoardItem | null>(null);

  if (pending.length === 0) return null;

  return (
    <div className="mt-2">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-white/70">
        <span className="h-3 w-1 bg-white/30" />
        Ideas — to be confirmed
      </h3>
      <div className="flex flex-wrap gap-3">
        {pending.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setEditing(item)}
            className="flex w-36 shrink-0 flex-col overflow-hidden rounded-xl border border-white/15 bg-white/5 text-left shadow-lg shadow-black/20 transition-transform duration-150 ease-out hover:-translate-y-0.5"
          >
            {item.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image_url} alt="" className="h-20 w-full object-cover" />
            ) : (
              <div className="flex h-20 w-full items-center justify-center bg-white/5 text-[10px] text-white/30">
                No image
              </div>
            )}
            <div className="p-2">
              <p className="truncate text-xs font-semibold text-white">{item.title}</p>
              <p className="text-[10px] uppercase tracking-wide text-[var(--accent)]">To be confirmed</p>
            </div>
          </button>
        ))}
      </div>

      {editing && (
        <ScheduleModal
          artistId={artistId}
          slug={slug}
          item={editing}
          onClose={() => setEditing(null)}
          onScheduled={(update) => {
            if (update.calendar_status === "confirmed") {
              setPending((prev) => prev.filter((i) => i.id !== editing.id));
            } else {
              setPending((prev) => prev.map((i) => (i.id === editing.id ? { ...i, ...update } : i)));
            }
          }}
        />
      )}
    </div>
  );
}
