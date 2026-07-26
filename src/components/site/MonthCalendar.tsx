"use client";

import { useState, useTransition, useRef } from "react";
import { addManualEvent, deleteManualEvent } from "@/app/s/[slug]/actions";
import { useEditMode } from "@/components/site/EditModeContext";
import type { ArtistEvent } from "@/lib/database.types";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayKey(year: number, month: number, day: number): string {
  return `${year}-${month}-${day}`;
}

const fieldClass =
  "rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:border-[var(--accent)] focus:outline-none [color-scheme:dark]";
const labelClass = "text-xs uppercase tracking-wide text-white/50";

function AddEventModal({
  artistId,
  slug,
  onClose,
  onAdded,
}: {
  artistId: string;
  slug: string;
  onClose: () => void;
  onAdded: (event: ArtistEvent) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await addManualEvent(artistId, slug, formData);
      if (result.ok) {
        onAdded(result.event);
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-xl border border-white/15 bg-neutral-950 p-5 text-white shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Add event</p>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 transition-colors hover:text-white"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className={labelClass}>Venue</span>
          <input name="venue" required className={fieldClass} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className={labelClass}>City</span>
            <input name="city" className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className={labelClass}>Country</span>
            <input name="country" className={fieldClass} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className={labelClass}>Date</span>
            <input name="date" type="date" required className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className={labelClass}>Time</span>
            <input name="time" type="time" className={fieldClass} />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className={labelClass}>Description</span>
          <textarea name="description" rows={3} className={fieldClass} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className={labelClass}>Ticket / info link</span>
          <input name="url" type="url" placeholder="https://" className={fieldClass} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className={labelClass}>Image (optional)</span>
          <input
            name="image"
            type="file"
            accept="image/*"
            className="text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white file:transition-colors hover:file:bg-white/20"
          />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={isPending}
          className="mt-1 self-start rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition-transform duration-150 ease-out hover:-translate-y-0.5 disabled:opacity-50"
        >
          {isPending ? "Adding..." : "Add event"}
        </button>
      </form>
    </div>
  );
}

/** A standard month-grid calendar (weeks as rows, Sun-Sat columns) with a
 * small dot under any date that has an event — the same "glance at the
 * grid, tap a date for details" pattern iOS Calendar uses — rather than
 * the flat grouped list this replaced, which read more like a press
 * release than a calendar. Also owns the "+ Add event" flow: manually
 * created events (with an optional description/image) sit alongside the
 * Ticketmaster/web-search ones, for dates no public source would know
 * about. */
export function MonthCalendar({
  artistId,
  slug,
  events: initialEvents,
}: {
  artistId: string;
  slug: string;
  events: ArtistEvent[];
}) {
  const { editingAllowed } = useEditMode();
  const [events, setEvents] = useState(initialEvents);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [, startTransition] = useTransition();

  const byDay = new Map<string, ArtistEvent[]>();
  for (const event of events) {
    const d = new Date(event.event_date);
    const key = dayKey(d.getFullYear(), d.getMonth(), d.getDate());
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(event);
  }

  // One grid per month that actually has an event, in chronological order —
  // falling back to the current month alone so there's always somewhere to
  // click "+ Add event" even before any dates exist.
  const monthOrder: { year: number; month: number }[] = [];
  const seenMonths = new Set<string>();
  for (const event of events) {
    const d = new Date(event.event_date);
    const mKey = `${d.getFullYear()}-${d.getMonth()}`;
    if (!seenMonths.has(mKey)) {
      seenMonths.add(mKey);
      monthOrder.push({ year: d.getFullYear(), month: d.getMonth() });
    }
  }
  if (monthOrder.length === 0) {
    const now = new Date();
    monthOrder.push({ year: now.getFullYear(), month: now.getMonth() });
  }

  const today = new Date();
  const selected = selectedKey ? byDay.get(selectedKey) : undefined;

  function handleDelete(eventId: string) {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    startTransition(() => {
      deleteManualEvent(eventId, slug);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {editingAllowed && (
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="self-start rounded-full border border-white/20 px-4 py-1.5 text-xs font-medium text-white/70 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-white/40 hover:text-white"
        >
          + Add event
        </button>
      )}

      {monthOrder.map(({ year, month }) => {
        const firstOfMonth = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startWeekday = firstOfMonth.getDay();
        const cells: (number | null)[] = [
          ...Array(startWeekday).fill(null),
          ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
        ];
        while (cells.length % 7 !== 0) cells.push(null);

        const monthLabel = firstOfMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });

        return (
          <div key={`${year}-${month}`}>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-white/70">
              <span className="h-3 w-1 bg-[var(--accent)]" />
              {monthLabel}
            </h3>
            <div
              className="p-4 shadow-lg shadow-black/30 backdrop-blur-md"
              style={{
                borderRadius: "var(--card-radius, 12px)",
                backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
                border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
              }}
            >
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-white/40">
                {WEEKDAY_LABELS.map((w) => (
                  <div key={w} className="py-1">
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, i) => {
                  if (day === null) return <div key={i} className="aspect-square" />;
                  const key = dayKey(year, month, day);
                  const dayEvents = byDay.get(key);
                  const hasEvents = !!dayEvents?.length;
                  const isSelected = selectedKey === key;
                  const isToday =
                    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                  return (
                    <button
                      type="button"
                      key={i}
                      onClick={() => hasEvents && setSelectedKey(isSelected ? null : key)}
                      disabled={!hasEvents}
                      className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-lg text-sm transition-colors ${
                        isSelected
                          ? "bg-[var(--accent)] font-semibold text-black"
                          : hasEvents
                            ? "text-white hover:bg-white/10"
                            : "text-white/30"
                      } ${isToday && !isSelected ? "ring-1 ring-inset ring-white/40" : ""}`}
                    >
                      <span>{day}</span>
                      {hasEvents && (
                        <span
                          className="h-1 w-1 rounded-full"
                          style={{ backgroundColor: isSelected ? "black" : "var(--accent)" }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {selected && selectedKey && selectedKey.split("-").slice(0, 2).join("-") === `${year}-${month}` && (
              <div className="mt-3 flex flex-col gap-2">
                {selected.map((event) => (
                  <div
                    key={event.id}
                    className="relative p-4 shadow-lg shadow-black/30 backdrop-blur-md"
                    style={{
                      borderRadius: "var(--card-radius, 12px)",
                      backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
                      border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
                    }}
                  >
                    {event.source === "manual" && editingAllowed && (
                      <button
                        type="button"
                        onClick={() => handleDelete(event.id)}
                        aria-label="Delete event"
                        className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold leading-none text-white shadow-lg hover:bg-red-400"
                      >
                        ×
                      </button>
                    )}
                    {event.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={event.image_url}
                        alt=""
                        className="mb-3 h-32 w-full rounded-lg object-cover"
                      />
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{event.venue}</p>
                        <p className="text-sm text-white/60">
                          {[event.city, event.country].filter(Boolean).join(", ") || "Location TBA"}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-white/30">
                        {event.source === "web"
                          ? "found via web search"
                          : event.source === "manual"
                            ? "added manually"
                            : event.source}
                      </span>
                    </div>
                    {event.description && (
                      <p className="mt-2 text-sm text-white/70">{event.description}</p>
                    )}
                    {event.url && (
                      <a
                        href={event.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-xs font-medium text-[var(--accent)] hover:underline"
                      >
                        View details →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {showAddModal && (
        <AddEventModal
          artistId={artistId}
          slug={slug}
          onClose={() => setShowAddModal(false)}
          onAdded={(event) => setEvents((prev) => [...prev, event])}
        />
      )}
    </div>
  );
}
