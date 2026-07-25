// Chosen by character count so a long value (e.g. a lifetime view count in
// the hundreds of millions) shrinks to fit the card instead of overflowing
// it, rather than a single fixed text-3xl that only fits short numbers.
function valueSizeClass(value: string): string {
  const len = value.length;
  if (len > 13) return "text-lg sm:text-xl";
  if (len > 10) return "text-xl sm:text-2xl";
  if (len > 7) return "text-2xl sm:text-3xl";
  return "text-3xl";
}

export function KpiCard({
  label,
  value,
  caption,
  trend,
  color = "var(--primary)",
}: {
  label: string;
  value: string;
  caption: string;
  trend?: string | null;
  color?: string;
}) {
  return (
    <div
      className="overflow-hidden p-4 shadow-lg shadow-black/30 backdrop-blur-md transition-all duration-150 ease-out hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_0_28px_var(--accent)]"
      style={{
        borderRadius: "var(--card-radius, 12px)",
        backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
        border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
      }}
    >
      <p
        className="truncate text-xs uppercase tracking-wide opacity-60"
        style={{ color: "var(--card-text-color, #fff)" }}
      >
        {label}
      </p>
      <p
        className={`mt-1 truncate font-bold leading-tight ${valueSizeClass(value)}`}
        style={{ color }}
        title={value}
      >
        {value}
      </p>
      <p className="mt-1 truncate text-xs opacity-50" style={{ color: "var(--card-text-color, #fff)" }}>
        {caption}
      </p>
      {trend && (
        <p
          className={`mt-1 truncate text-xs font-medium ${
            trend.startsWith("+") ? "text-emerald-400" : trend.startsWith("−") || trend.startsWith("-") ? "text-rose-400" : "opacity-60"
          }`}
        >
          {trend}
        </p>
      )}
    </div>
  );
}
