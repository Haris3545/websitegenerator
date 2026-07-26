"use client";

import { useState } from "react";
import type { ArtistEvent } from "@/lib/database.types";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayKey(year: number, month: number, day: number): string {
  return `${year}-${month}-${day}`;
}

/** A standard month-grid calendar (weeks as rows, Sun-Sat columns) with a
 * small dot under any date that has an event — the same "glance at the
 * grid, tap a date for details" pattern iOS Calendar uses — rather than
 * the flat grouped list this replaced, which read more like a press
 * release than a calendar. */
export function MonthCalendar({ events }: { events: ArtistEvent[] }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const byDay = new Map<string, ArtistEvent[]>();
  for (const event of events) {
    const d = new Date(event.event_date);
    const key = dayKey(d.getFullYear(), d.getMonth(), d.getDate());
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(event);
  }

  // One grid per month that actually has an event, in chronological order.
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

  const today = new Date();
  const selected = selectedKey ? byDay.get(selectedKey) : undefined;

  return (
    <div className="flex flex-col gap-8">
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
                  <a
                    key={event.id}
                    href={event.url ?? undefined}
                    target={event.url ? "_blank" : undefined}
                    rel="noreferrer"
                    className="block p-4 shadow-lg shadow-black/30 backdrop-blur-md transition-all duration-150 hover:-translate-y-0.5 hover:brightness-110"
                    style={{
                      borderRadius: "var(--card-radius, 12px)",
                      backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
                      border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
                      cursor: event.url ? "pointer" : "default",
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{event.venue}</p>
                        <p className="text-sm text-white/60">
                          {[event.city, event.country].filter(Boolean).join(", ") || "Location TBA"}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-white/30">
                        {event.source === "web" ? "found via web search" : event.source}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
