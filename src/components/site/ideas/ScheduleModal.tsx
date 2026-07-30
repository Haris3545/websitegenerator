"use client";

import { useState, useTransition } from "react";
import { scheduleIdeaToCalendar } from "@/app/s/[slug]/actions";
import { useClosableOverlay } from "@/hooks/useClosableOverlay";
import type { ArtistEvent, BoardItem } from "@/lib/database.types";

const fieldClass =
  "rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white transition-colors focus:border-[var(--accent)] focus:bg-white/[0.07] focus:outline-none [color-scheme:dark]";
const labelClass = "text-xs font-medium uppercase tracking-wide text-white/45";

/** "Add to calendar" from the Liked folder — a confirmed date/time puts the
 * idea straight onto the Calendar tab's month grid like any other event; a
 * "to be confirmed" idea instead shows up in the small pending stack at the
 * bottom of that tab with no firm date yet. */
export function ScheduleModal({
  artistId,
  slug,
  item,
  onClose,
  onScheduled,
}: {
  artistId: string;
  slug: string;
  item: BoardItem;
  onClose: () => void;
  onScheduled: (update: {
    calendar_status: "confirmed" | "tbc";
    scheduled_date: string | null;
    scheduled_time: string | null;
    event: ArtistEvent | null;
  }) => void;
}) {
  const [date, setDate] = useState(item.scheduled_date ?? "");
  const [time, setTime] = useState(item.scheduled_time ?? "");
  const [tbc, setTbc] = useState(item.calendar_status === "tbc");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { closing, requestClose } = useClosableOverlay(onClose);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tbc && !date) {
      setError("Pick a date, or tick “to be confirmed”.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await scheduleIdeaToCalendar(item.id, artistId, slug, { date, time, tbc });
      if (result.ok) {
        onScheduled({
          calendar_status: tbc ? "tbc" : "confirmed",
          scheduled_date: date || null,
          scheduled_time: time || null,
          event: result.event,
        });
        requestClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={requestClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className={`flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-white/15 bg-neutral-950 text-white shadow-2xl shadow-black/50 ${
          closing ? "animate-modal-out" : "animate-modal-in"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <p className="text-base font-semibold">Add to calendar</p>
            <p className="text-xs text-white/40">{item.title}</p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className={labelClass}>Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={tbc && !date}
                className={fieldClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className={labelClass}>Time</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={fieldClass} />
            </label>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/80">
            <input
              type="checkbox"
              checked={tbc}
              onChange={(e) => setTbc(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            To be confirmed — I don&apos;t know the date/time yet
          </label>

          {tbc && (
            <p className="text-xs text-white/40">
              This idea will sit in a small &quot;to be confirmed&quot; stack at the bottom of the Calendar
              tab until you come back and lock in a date.
            </p>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-white/60 transition-colors hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-black transition-transform duration-150 ease-out [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
