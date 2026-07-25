import type { ArtistEvent } from "@/lib/database.types";

export function EventList({
  events,
  groupBy,
}: {
  events: ArtistEvent[];
  groupBy: "city" | "month";
}) {
  const groups = new Map<string, ArtistEvent[]>();
  for (const event of events) {
    const key =
      groupBy === "city"
        ? [event.city, event.country].filter(Boolean).join(", ") || "Location TBA"
        : new Date(event.event_date).toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(event);
  }

  return (
    <div className="flex flex-col gap-6">
      {Array.from(groups.entries()).map(([label, items]) => (
        <div key={label}>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-white/70">
            <span className="h-3 w-1 bg-[var(--accent)]" />
            {label}
          </h3>
          <div className="flex flex-col gap-3">
            {items.map((event) => (
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
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{event.venue}</p>
                    {groupBy === "month" && (
                      <p className="text-sm text-white/60">
                        {[event.city, event.country].filter(Boolean).join(", ") || "Location TBA"}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">
                    {new Date(event.event_date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: groupBy === "city" ? "numeric" : undefined,
                    })}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
