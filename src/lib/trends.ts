import { createServiceRoleClient } from "@/lib/supabase/server";

export type MetricTrend = { delta: number; days: number };

/** Reads the two most recent rows of the append-only artist_metric_snapshots
 * log (written each time refreshInsightsNow runs) and diffs them per metric.
 * Only numeric metrics that actually moved are returned — everything else
 * (missing history, an unchanged value) is simply absent from the result,
 * so callers can treat "no entry" as "nothing to show" rather than "0". */
export async function getRecentTrends(artistId: string): Promise<Record<string, MetricTrend>> {
  const supabase = createServiceRoleClient();
  const { data: snapshots } = await supabase
    .from("artist_metric_snapshots")
    .select("metrics, captured_at")
    .eq("artist_id", artistId)
    .order("captured_at", { ascending: false })
    .limit(2);

  if (!snapshots || snapshots.length < 2) return {};

  const [latest, previous] = snapshots;
  const days = Math.max(
    0,
    Math.round(
      (new Date(latest.captured_at).getTime() - new Date(previous.captured_at).getTime()) / 86_400_000
    )
  );

  const trends: Record<string, MetricTrend> = {};
  for (const key of Object.keys(latest.metrics)) {
    const after = latest.metrics[key];
    const before = previous.metrics[key];
    if (typeof after === "number" && typeof before === "number" && after !== before) {
      trends[key] = { delta: after - before, days };
    }
  }
  return trends;
}

/** Formats a metric delta as a short KPI-card caption, e.g. "+1.2K in 3d" —
 * the sign prefix drives KpiCard's green/red trend coloring. */
export function formatTrend(trend: MetricTrend | undefined): string | null {
  if (!trend || trend.delta === 0) return null;
  const sign = trend.delta > 0 ? "+" : "−";
  const abs = Math.abs(trend.delta);
  const num = abs >= 10_000 ? `${Math.round(abs / 1000)}K` : abs >= 1000 ? `${(abs / 1000).toFixed(1)}K` : abs.toLocaleString();
  const period = trend.days <= 0 ? "since last check" : trend.days === 1 ? "in 1 day" : `in ${trend.days}d`;
  return `${sign}${num} ${period}`;
}
