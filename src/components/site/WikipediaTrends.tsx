import type { WikipediaTrends } from "@/lib/wikipedia";

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 88;
  const h = 30;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
    </svg>
  );
}

function ChangeBadge({ changePct }: { changePct: number | null }) {
  if (changePct === null) return null;
  const up = changePct >= 0;
  return (
    <span className={`text-xs font-semibold ${up ? "text-emerald-400" : "text-red-400"}`}>
      {up ? "▲" : "▼"} {Math.abs(changePct).toFixed(1)}%
    </span>
  );
}

export function WikipediaTrendsSection({ trends, artistName }: { trends: WikipediaTrends; artistName: string }) {
  if (!trends.articles.length) return null;

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
            Wikipedia pageviews
          </h3>
          <p className="mt-0.5 text-sm opacity-60" style={{ color: "var(--card-text-color, #fff)" }}>
            Daily attention signal across {artistName}-related English Wikipedia articles — last 60
            days
          </p>
        </div>
        {trends.topMover && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide opacity-40" style={{ color: "var(--card-text-color, #fff)" }}>
              Top mover this week
            </p>
            <p className="text-sm font-semibold" style={{ color: "var(--card-text-color, #fff)" }}>
              {trends.topMover.title} <ChangeBadge changePct={trends.topMover.changePct} />
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {trends.articles.map((article) => (
          <div
            key={article.title}
            className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-white/20"
          >
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium" style={{ color: "var(--card-text-color, #fff)" }}>
                  {article.title}
                </p>
                <ChangeBadge changePct={article.changePct} />
              </div>
              <p className="mt-1 text-2xl font-bold" style={{ color: "var(--accent)" }}>
                {article.last7DayViews >= 1000
                  ? `${(article.last7DayViews / 1000).toFixed(1)}K`
                  : article.last7DayViews.toLocaleString()}
              </p>
              <p className="text-xs opacity-40" style={{ color: "var(--card-text-color, #fff)" }}>
                views · last 7d
              </p>
            </div>
            <Sparkline data={article.dailyViews} />
          </div>
        ))}
      </div>

      <p className="mt-4 text-[10px] uppercase tracking-wide opacity-30" style={{ color: "var(--card-text-color, #fff)" }}>
        Source: Wikimedia REST API. Data lags ~1 day.
      </p>
    </div>
  );
}
