"use client";

import { useEffect, useMemo, useState, useTransition, useRef } from "react";
import { addManualEvent, deleteCalendarEvent } from "@/app/s/[slug]/actions";
import { useEditMode } from "@/components/site/EditModeContext";
import { useClosableOverlay } from "@/hooks/useClosableOverlay";
import type { ArtistEvent } from "@/lib/database.types";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type SourceFilter = "all" | "concerts" | "ideas" | "manual";

function sourceCategory(source: string): Exclude<SourceFilter, "all"> {
  if (source === "idea") return "ideas";
  if (source === "manual") return "manual";
  return "concerts";
}

const FILTER_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "concerts", label: "Concerts" },
  { value: "ideas", label: "Ideas" },
  { value: "manual", label: "Manual" },
];

function dayKey(year: number, month: number, day: number): string {
  return `${year}-${month}-${day}`;
}

const fieldClass =
  "rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white transition-colors focus:border-[var(--accent)] focus:bg-white/[0.07] focus:outline-none [color-scheme:dark]";
const labelClass = "text-xs font-medium uppercase tracking-wide text-white/45";

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
  const [fileName, setFileName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { closing, requestClose } = useClosableOverlay(onClose);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await addManualEvent(artistId, slug, formData);
      if (result.ok) {
        onAdded(result.event);
        requestClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={requestClose}
    >
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/15 bg-neutral-950 text-white shadow-2xl shadow-black/50 ${
          closing ? "animate-modal-out" : "animate-modal-in"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <p className="text-base font-semibold">Add event</p>
            <p className="text-xs text-white/40">Shows up on the calendar for everyone with access</p>
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

        <div className="custom-scrollbar flex flex-col gap-4 overflow-y-auto px-6 py-5">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Venue</span>
            <input name="venue" required className={fieldClass} placeholder="e.g. The O2 Arena" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className={labelClass}>City</span>
              <input name="city" className={fieldClass} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className={labelClass}>Country</span>
              <input name="country" className={fieldClass} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className={labelClass}>Date</span>
              <input name="date" type="date" required className={fieldClass} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className={labelClass}>Time</span>
              <input name="time" type="time" className={fieldClass} />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Description</span>
            <textarea
              name="description"
              rows={3}
              className={`${fieldClass} resize-none`}
              placeholder="Optional notes about the event"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Ticket / info link</span>
            <input name="url" type="url" placeholder="https://" className={fieldClass} />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Image (optional)</span>
            <div className="flex items-center gap-3">
              <label
                htmlFor="calendar-event-image"
                className="cursor-pointer shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10"
              >
                Choose file
              </label>
              <input
                id="calendar-event-image"
                name="image"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />
              <span className="truncate text-xs text-white/40">{fileName ?? "No file chosen"}</span>
            </div>
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
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
            className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-black transition-transform duration-150 ease-out hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
          >
            {isPending ? "Adding..." : "Add event"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** A standard month-grid calendar (weeks as rows, Sun-Sat columns) with a
 * small dot under any date that has an event — the same "glance at the
 * grid, tap a date for details" pattern iOS Calendar uses. Shows one month
 * at a time with a dropdown + prev/next arrows to move between months,
 * rather than stacking every month with an event underneath each other.
 * Also owns the "+ Add event" flow: manually created events (with an
 * optional description/image) sit alongside the Ticketmaster/web-search
 * ones, for dates no public source would know about. */
export function MonthCalendar({
  artistId,
  slug,
  events: initialEvents,
  dragHoverDayKey,
  injectedEvent,
  onInjected,
}: {
  artistId: string;
  slug: string;
  events: ArtistEvent[];
  /** The day cell (see dayKey) currently under an external drag — e.g. a
   * to-be-confirmed idea being dragged over from PendingIdeaStack — so it
   * can be highlighted as a drop target. */
  dragHoverDayKey?: string | null;
  /** An event created/updated elsewhere (a drag-drop schedule from
   * PendingIdeaStack) to merge into this already-rendered calendar without
   * a full page refetch. Call onInjected once consumed. */
  injectedEvent?: ArtistEvent | null;
  onInjected?: () => void;
}) {
  const { editingAllowed } = useEditMode();
  const [events, setEvents] = useState(initialEvents);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewIndex, setViewIndex] = useState(0);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [monthPickerClosing, setMonthPickerClosing] = useState(false);
  const [, startTransition] = useTransition();

  function closeMonthPicker() {
    if (monthPickerClosing) return;
    setMonthPickerClosing(true);
    window.setTimeout(() => {
      setMonthPickerOpen(false);
      setMonthPickerClosing(false);
    }, 150);
  }

  // Merges an externally-scheduled event (dragged onto a day from
  // PendingIdeaStack) into local state. Guarded by an existence check
  // rather than an effect, so this is the "adjust state during rendering"
  // pattern React's own docs recommend for syncing an incoming prop into
  // state — it's idempotent (only fires while the event is genuinely
  // missing) so it can't loop.
  if (injectedEvent && !events.some((e) => e.id === injectedEvent.id)) {
    setEvents((prev) => [...prev.filter((e) => e.id !== injectedEvent.id), injectedEvent]);
  }

  const filteredEvents = useMemo(
    () => (sourceFilter === "all" ? events : events.filter((e) => sourceCategory(e.source) === sourceFilter)),
    [events, sourceFilter]
  );

  const byDay = useMemo(() => {
    const map = new Map<string, ArtistEvent[]>();
    for (const event of filteredEvents) {
      const d = new Date(event.event_date);
      const key = dayKey(d.getFullYear(), d.getMonth(), d.getDate());
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    }
    return map;
  }, [filteredEvents]);

  // A full rolling year starting this month, plus any (filtered) event's
  // month beyond that window — so the picker is always browsable even for
  // an artist with events clustered in a single month, rather than only
  // ever listing whichever months happen to already have something on them.
  const monthOrder = useMemo(() => {
    const seenMonths = new Set<string>();
    const months: { year: number; month: number }[] = [];
    const now = new Date();
    const addMonth = (year: number, month: number) => {
      const mKey = `${year}-${month}`;
      if (!seenMonths.has(mKey)) {
        seenMonths.add(mKey);
        months.push({ year, month });
      }
    };
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      addMonth(d.getFullYear(), d.getMonth());
    }
    for (const event of filteredEvents) {
      const d = new Date(event.event_date);
      addMonth(d.getFullYear(), d.getMonth());
    }
    months.sort((a, b) => a.year - b.year || a.month - b.month);
    return months;
  }, [filteredEvents]);

  // Same render-time-adjustment approach for navigating to the injected
  // event's month/day — self-terminating once viewIndex/selectedKey match,
  // so it converges within a render or two rather than looping.
  if (injectedEvent) {
    const d = new Date(injectedEvent.event_date);
    const wantedKey = dayKey(d.getFullYear(), d.getMonth(), d.getDate());
    const idx = monthOrder.findIndex((m) => m.year === d.getFullYear() && m.month === d.getMonth());
    if (idx !== -1 && idx !== viewIndex) setViewIndex(idx);
    if (selectedKey !== wantedKey) setSelectedKey(wantedKey);
  }

  // Once the merge + navigation above have both landed, tell the parent
  // this injected event has been consumed so it clears it back to null —
  // this effect only ever calls the *prop* callback, never a local
  // setState, so it's just a plain "notify an external system" effect.
  useEffect(() => {
    if (!injectedEvent) return;
    const stillMissing = !events.some((e) => e.id === injectedEvent.id);
    const d = new Date(injectedEvent.event_date);
    const wantedKey = dayKey(d.getFullYear(), d.getMonth(), d.getDate());
    if (!stillMissing && selectedKey === wantedKey) onInjected?.();
  }, [injectedEvent, events, selectedKey, onInjected]);

  const safeIndex = Math.min(viewIndex, monthOrder.length - 1);
  const { year, month } = monthOrder[safeIndex];

  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstOfMonth.getDay();
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = firstOfMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const today = new Date();
  const selected = selectedKey ? byDay.get(selectedKey) : undefined;
  const selectedBelongsToViewedMonth =
    selected && selectedKey && selectedKey.split("-").slice(0, 2).join("-") === `${year}-${month}`;

  function handleDelete(eventId: string) {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    startTransition(() => {
      deleteCalendarEvent(eventId, slug);
    });
  }

  function goToMonth(index: number) {
    setViewIndex(Math.max(0, Math.min(index, monthOrder.length - 1)));
    setSelectedKey(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => goToMonth(safeIndex - 1)}
            disabled={safeIndex === 0}
            aria-label="Previous month"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-white/60 transition-colors hover:border-white/30 hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            ‹
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => (monthPickerOpen ? closeMonthPicker() : setMonthPickerOpen(true))}
              className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 py-1.5 pl-4 pr-3.5 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:border-white/30"
            >
              {monthLabel}
              <span
                className="text-[10px] text-white/40 transition-transform duration-150"
                style={{ transform: monthPickerOpen ? "rotate(180deg)" : "none" }}
              >
                ▾
              </span>
            </button>

            {monthPickerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={closeMonthPicker} />
                <div
                  className={`custom-scrollbar absolute left-0 top-full z-50 mt-2 max-h-64 w-52 overflow-y-auto rounded-xl border border-white/15 bg-neutral-900 p-1.5 shadow-2xl shadow-black/50 ${
                    monthPickerClosing ? "animate-dropdown-furl" : "animate-dropdown-unfurl"
                  }`}
                >
                  {monthOrder.map(({ year: y, month: m }, i) => (
                    <button
                      key={`${y}-${m}`}
                      type="button"
                      onClick={() => {
                        goToMonth(i);
                        closeMonthPicker();
                      }}
                      className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        i === safeIndex
                          ? "bg-[var(--accent)] font-semibold text-black"
                          : "text-white/80 hover:bg-white/10"
                      }`}
                    >
                      {new Date(y, m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => goToMonth(safeIndex + 1)}
            disabled={safeIndex === monthOrder.length - 1}
            aria-label="Next month"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-white/60 transition-colors hover:border-white/30 hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            ›
          </button>
        </div>

        {editingAllowed && (
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="self-start rounded-full border border-white/20 px-4 py-1.5 text-xs font-medium text-white/70 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-white/40 hover:text-white"
          >
            + Add event
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSourceFilter(opt.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              sourceFilter === opt.value
                ? "bg-[var(--accent)] text-black"
                : "border border-white/15 text-white/60 hover:border-white/30 hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div>
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
              const isDropTarget = dragHoverDayKey === key;
              return (
                <button
                  type="button"
                  key={i}
                  data-calendar-day={key}
                  onClick={() => hasEvents && setSelectedKey(isSelected ? null : key)}
                  disabled={!hasEvents}
                  className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-lg text-sm transition-colors ${
                    isDropTarget
                      ? "bg-emerald-400/30 text-white ring-2 ring-emerald-400"
                      : isSelected
                        ? "bg-[var(--accent)] font-semibold text-black"
                        : hasEvents
                          ? "text-white hover:bg-white/10"
                          : "text-white/30"
                  } ${isToday && !isSelected && !isDropTarget ? "ring-1 ring-inset ring-white/40" : ""}`}
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

        {selectedBelongsToViewedMonth && selected && (
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
                {(event.source === "manual" || event.source === "idea") && editingAllowed && (
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
                        : event.source === "idea"
                          ? "scheduled from an idea"
                          : event.source}
                  </span>
                </div>
                {event.description && (
                  <p className="mt-2 whitespace-pre-line text-sm text-white/70">{event.description}</p>
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

      {showAddModal && (
        <AddEventModal
          artistId={artistId}
          slug={slug}
          onClose={() => setShowAddModal(false)}
          onAdded={(event) => {
            setEvents((prev) => [...prev, event]);
            const d = new Date(event.event_date);
            const idx = monthOrder.findIndex((m) => m.year === d.getFullYear() && m.month === d.getMonth());
            if (idx !== -1) setViewIndex(idx);
          }}
        />
      )}
    </div>
  );
}
