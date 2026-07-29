import type { SearchTrendPoint } from "@/lib/database.types";

/** A wider line chart (not the small per-article Sparkline WikipediaTrends
 * uses) since this is a single series with room to show axis labels —
 * Google's own 0-100 relative-interest scale, via SerpApi. */
function TrendLine({ points }: { points: SearchTrendPoint[] }) {
  const w = 100;
  const h = 40;
  const values = points.map((p) => p.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p.value - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-24 w-full overflow-visible">
      <polyline
        points={`0,${h} ${points.map((p, i) => `${((i / (points.length - 1)) * w).toFixed(1)},${(h - ((p.value - min) / range) * h).toFixed(1)}`).join(" ")} ${w},${h}`}
        fill="var(--accent)"
        opacity={0.12}
        stroke="none"
      />
      {/* preserveAspectRatio="none" stretches x/y independently to fill a
          much-wider-than-tall box, which without this would scale a
          pre-transform strokeWidth far more vertically than horizontally —
          turning a thin line into thick, near-solid triangular peaks (as
          seen with a card ~2.5x wider than 40 units tall stretched to
          ~12x wider than 96px tall). non-scaling-stroke keeps the stroke a
          constant screen-pixel width regardless of that anisotropic scale. */}
      <path
        d={path}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function SearchTrendsSection({ points, artistName }: { points: SearchTrendPoint[]; artistName: string }) {
  if (points.length < 2) return null;

  const latest = points[points.length - 1];
  const earliest = points[0];
  const changePct =
    earliest.value > 0 ? ((latest.value - earliest.value) / earliest.value) * 100 : null;

  return (
    <div
      className="p-5 shadow-lg shadow-black/30 backdrop-blur-md"
      style={{
        borderRadius: "var(--card-radius, 12px)",
        backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
        border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
      }}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
            Google search interest
          </h3>
          <p className="mt-0.5 text-sm opacity-60" style={{ color: "var(--card-text-color, #fff)" }}>
            Relative search volume for &quot;{artistName}&quot; — 0-100 scale, Google&apos;s own peak-normalized index
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide opacity-40" style={{ color: "var(--card-text-color, #fff)" }}>
            Current
          </p>
          <p className="text-2xl font-bold" style={{ color: "var(--accent)" }}>
            {latest.value}
            {changePct !== null && (
              <span className={`ml-2 text-xs font-semibold ${changePct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {changePct >= 0 ? "▲" : "▼"} {Math.abs(changePct).toFixed(0)}%
              </span>
            )}
          </p>
        </div>
      </div>

      <TrendLine points={points} />

      <div className="mt-2 flex justify-between text-[10px] uppercase tracking-wide opacity-40" style={{ color: "var(--card-text-color, #fff)" }}>
        <span>{earliest.date}</span>
        <span>{latest.date}</span>
      </div>

      <p className="mt-4 text-[10px] uppercase tracking-wide opacity-30" style={{ color: "var(--card-text-color, #fff)" }}>
        Source: Google Trends (via SerpApi).
      </p>
    </div>
  );
}
