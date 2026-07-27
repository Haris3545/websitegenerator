"use client";

import { useState } from "react";
import { useClosableOverlay } from "@/hooks/useClosableOverlay";

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatShort(s: string): string {
  return fromISODate(s).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** A calendar-button date-range picker: click the pill to unfurl a
 * single-month grid (same unfurl/furl animation as the Locations "UK
 * cities" dropdown and the Calendar tab's month picker), click a day to set
 * the range start, click again to set the end (or restart the range if one
 * was already complete). Kept to one grid rather than a from/to pair of
 * plain date inputs since campaign windows are usually a short, contiguous
 * stretch that's easier to eyeball on a calendar than type out twice. */
export function CampaignDateRangeField({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string | null;
  endDate: string | null;
  onChange: (start: string | null, end: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { closing, requestClose } = useClosableOverlay(() => setOpen(false), 150);
  const initial = startDate ? fromISODate(startDate) : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  function changeMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function handleDayClick(day: number) {
    const clicked = toISODate(new Date(viewYear, viewMonth, day));
    if (!startDate || (startDate && endDate)) {
      onChange(clicked, null);
      return;
    }
    if (clicked < startDate) {
      onChange(clicked, startDate);
    } else {
      onChange(startDate, clicked);
    }
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const cells: (number | null)[] = [...Array.from({ length: startWeekday }, () => null), ...Array.from(
    { length: daysInMonth },
    (_, i) => i + 1
  )];

  const label =
    startDate && endDate
      ? `${formatShort(startDate)} – ${formatShort(endDate)}`
      : startDate
        ? `${formatShort(startDate)} – …`
        : "Set campaign dates";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? requestClose() : setOpen(true))}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-left text-sm text-white transition-colors hover:border-white/30 [color-scheme:dark]"
      >
        <span className={startDate ? "" : "text-white/40"}>{label}</span>
        <span
          className="text-[10px] text-white/40 transition-transform duration-150"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        >
          ▾
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={requestClose} />
          <div
            className={`absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-white/15 bg-neutral-900 p-3 shadow-2xl shadow-black/50 ${
              closing ? "animate-dropdown-furl" : "animate-dropdown-unfurl"
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Previous month"
              >
                ‹
              </button>
              <p className="text-xs font-semibold text-white">
                {new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </p>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Next month"
              >
                ›
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[9px] uppercase tracking-wide text-white/40">
              {WEEKDAY_LABELS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (day === null) return <span key={`pad-${i}`} />;
                const iso = toISODate(new Date(viewYear, viewMonth, day));
                const isStart = iso === startDate;
                const isEnd = iso === endDate;
                const inRange = !!startDate && !!endDate && iso > startDate && iso < endDate;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => handleDayClick(day)}
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors ${
                      isStart || isEnd
                        ? "bg-[var(--accent)] font-semibold text-black"
                        : inRange
                          ? "bg-[var(--accent)]/20 text-white"
                          : "text-white/70 hover:bg-white/10"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {startDate && (
              <button
                type="button"
                onClick={() => onChange(null, null)}
                className="mt-2 text-[11px] font-medium text-white/40 transition-colors hover:text-white"
              >
                Clear dates
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
