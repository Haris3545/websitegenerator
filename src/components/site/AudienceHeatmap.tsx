"use client";

import { Fragment, useMemo, useState } from "react";
import type { Database } from "@/lib/database.types";
import { AudienceTable } from "@/components/site/AudienceTable";
import { classifyStatement, sortCategoryNames, OTHER_CATEGORY } from "@/lib/audienceCategories";

type Statement = Database["public"]["Tables"]["audience_statements"]["Row"];
type Metric = "index_value" | "column_pct" | "row_pct" | "responses";
type SortMode = "category" | "highest" | "lowest";

const METRICS: { key: Metric; label: string }[] = [
  { key: "index_value", label: "Index" },
  { key: "column_pct", label: "Column %" },
  { key: "row_pct", label: "Row %" },
  { key: "responses", label: "Responses" },
];

const SORT_MODES: { key: SortMode; label: string }[] = [
  { key: "category", label: "Category" },
  { key: "highest", label: "Highest first" },
  { key: "lowest", label: "Lowest first" },
];

interface HeatmapRow {
  statement: string;
  category: string;
  bySegment: Map<string, Statement>;
}

function formatValue(v: number, metric: Metric): string {
  if (metric === "column_pct" || metric === "row_pct") return `${v}%`;
  return String(v);
}

function formatMetric(row: Statement, metric: Metric): string {
  const v = row[metric];
  return v == null ? "—" : formatValue(v, metric);
}

/** Blue at the low end of whatever's currently being shown, red at the high
 * end, blending through white in between — driven by the selected metric's
 * own min/max in this upload (not a fixed reference point), so it reads
 * correctly whichever of the four metrics is on screen. Lightness is capped
 * at both ends so the black cell text stays legible even at the most
 * extreme values. */
function metricToBackground(value: number, min: number, max: number): string {
  const range = max - min;
  const t = range > 0 ? ((value - min) / range) * 2 - 1 : 0;
  const clamped = Math.max(-1, Math.min(1, t));
  const cold: [number, number, number] = [59, 130, 246];
  const hot: [number, number, number] = [220, 38, 38];
  const mid: [number, number, number] = [255, 255, 255];
  const target = clamped < 0 ? cold : hot;
  const k = 0.16 + Math.abs(clamped) * 0.5;
  const rgb = target.map((v2, i) => Math.round(mid[i] + (v2 - mid[i]) * k));
  return `rgb(${rgb.join(",")})`;
}

/** A statement is "hot" for a sort if any of its segments is — the highest
 * single value across the row's cells, not an average that would wash out
 * one segment strongly over/under-indexing while others sit near neutral. */
function rowSortValue(row: HeatmapRow, metric: Metric): number {
  let best: number | null = null;
  for (const cell of row.bySegment.values()) {
    const v = cell[metric];
    if (v == null) continue;
    if (best === null || v > best) best = v;
  }
  return best ?? -Infinity;
}

function categoryAnchorId(name: string): string {
  return "audience-cat-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function AudienceHeatmap({ statements }: { statements: Statement[] }) {
  const [view, setView] = useState<"heatmap" | "table">("heatmap");
  const [metric, setMetric] = useState<Metric>("index_value");
  const [sortMode, setSortMode] = useState<SortMode>("category");
  const [tooltip, setTooltip] = useState<{ x: number; y: number; row: Statement } | null>(null);

  const segments = useMemo(() => Array.from(new Set(statements.map((s) => s.segment))).sort(), [statements]);

  // Clipped to a percentile rather than the true min/max — GWI statements
  // with a tiny base size can swing to an extreme index (a handful of
  // respondents pushing it to 500+) that would otherwise squash every
  // ordinary value into one end of the scale. Values past the clip still
  // render at full-strength blue/red (metricToBackground clamps), they
  // just stop stretching the scale further once they're clearly already
  // an extreme.
  //
  // Index gets its own case: 100 is a real, meaningful reference point (as
  // likely as the general population to agree with a statement), not just
  // this dataset's midpoint, so it stays anchored at the centre of the
  // scale — the spread on either side comes from the 95th percentile of
  // how far values actually stray from it — rather than sliding wherever
  // this particular upload's min/max happen to fall.
  const metricRange = useMemo(() => {
    const values = statements
      .map((s) => s[metric])
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    if (!values.length) return { min: 0, max: 1 };
    const at = (sorted: number[], p: number) =>
      sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];

    if (metric === "index_value") {
      const deviations = values.map((v) => Math.abs(v - 100)).sort((a, b) => a - b);
      const spread = at(deviations, 0.95) || 1;
      return { min: 100 - spread, max: 100 + spread };
    }

    const min = at(values, 0.05);
    const max = at(values, 0.95);
    return min < max ? { min, max } : { min: values[0], max: values[values.length - 1] };
  }, [statements, metric]);

  const allRows = useMemo(() => {
    const rowsByKey = new Map<string, HeatmapRow>();
    for (const s of statements) {
      const category = classifyStatement(s.category, s.statement);
      const key = `${category}␟${s.statement}`;
      let row = rowsByKey.get(key);
      if (!row) {
        row = { statement: s.statement, category, bySegment: new Map() };
        rowsByKey.set(key, row);
      }
      row.bySegment.set(s.segment, s);
    }
    return [...rowsByKey.values()];
  }, [statements]);

  const categories = useMemo(() => {
    const byCategory = new Map<string, HeatmapRow[]>();
    for (const row of allRows) {
      const list = byCategory.get(row.category) ?? [];
      list.push(row);
      byCategory.set(row.category, list);
    }
    for (const list of byCategory.values()) {
      list.sort((a, b) => a.statement.localeCompare(b.statement));
    }
    return sortCategoryNames([...byCategory.keys()]).map((name) => ({
      name,
      rows: byCategory.get(name)!,
    }));
  }, [allRows]);

  const rankedRows = useMemo(() => {
    if (sortMode === "category") return null;
    const list = [...allRows];
    list.sort((a, b) => {
      const av = rowSortValue(a, metric);
      const bv = rowSortValue(b, metric);
      return sortMode === "highest" ? bv - av : av - bv;
    });
    return list;
  }, [allRows, sortMode, metric]);

  function showTooltip(e: React.MouseEvent, row: Statement) {
    setTooltip({ x: e.clientX, y: e.clientY, row });
  }

  function scrollToCategory(name: string) {
    document.getElementById(categoryAnchorId(name))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderRow(row: HeatmapRow, showCategory: boolean) {
    return (
      <tr key={`${row.category}-${row.statement}`}>
        <td className="px-3 py-1.5 align-middle text-white/70">
          {/* Wraps instead of truncating — a fixed max-width on the td
              itself is enough to keep the column from ballooning around one
              long statement, and a table cell in auto-layout respects
              max-width fine for wrapping (unlike the ellipsis+nowrap
              combination this used before, which needed the width on an
              inner element instead — see git history). */}
          <span className="block max-w-[320px] whitespace-normal break-words leading-snug">{row.statement}</span>
          {showCategory && <span className="mt-0.5 block text-[10px] text-white/30">{row.category}</span>}
        </td>
        {segments.map((seg) => {
          const cell = row.bySegment.get(seg);
          if (!cell) {
            return (
              <td key={seg} className="px-1.5 py-1 text-center align-middle">
                <span className="block rounded-lg bg-white/[0.03] py-2 text-xs text-white/20">—</span>
              </td>
            );
          }
          const rawValue = cell[metric];
          return (
            <td key={seg} className="px-1.5 py-1 text-center align-middle">
              <span
                role="button"
                tabIndex={0}
                onMouseEnter={(e) => showTooltip(e, cell)}
                onMouseMove={(e) => showTooltip(e, cell)}
                onMouseLeave={() => setTooltip(null)}
                onFocus={(e) =>
                  setTooltip({ x: e.currentTarget.getBoundingClientRect().left, y: e.currentTarget.getBoundingClientRect().top, row: cell })
                }
                onBlur={() => setTooltip(null)}
                className="block cursor-default rounded-lg py-2 font-mono text-xs font-semibold tabular-nums text-black/80 outline-none transition-shadow duration-150 ease-out focus-visible:ring-2 focus-visible:ring-white/60 [@media(hover:hover)]:hover:ring-2 [@media(hover:hover)]:hover:ring-white/50"
                style={{
                  backgroundColor:
                    rawValue == null
                      ? metricToBackground((metricRange.min + metricRange.max) / 2, metricRange.min, metricRange.max)
                      : metricToBackground(rawValue, metricRange.min, metricRange.max),
                }}
              >
                {formatMetric(cell, metric)}
              </span>
            </td>
          );
        })}
      </tr>
    );
  }

  if (view === "table") {
    return (
      <div className="flex flex-col gap-3">
        <ViewToggle view={view} onChange={setView} />
        <AudienceTable statements={statements} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewToggle view={view} onChange={setView} />
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-white/40">
            <span>{formatValue(metricRange.min, metric)}</span>
            <span
              className="h-2 w-24 rounded-full"
              style={{ background: "linear-gradient(90deg, rgb(59,130,246), rgba(255,255,255,0.15) 50%, rgb(220,38,38))" }}
            />
            <span>{formatValue(metricRange.max, metric)}</span>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 ${
                  metric === m.key ? "bg-[var(--accent)] text-black" : "text-white/50 hover:text-white/80"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-white/40">
          <span className="uppercase tracking-wide">Sort</span>
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
            {SORT_MODES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSortMode(s.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 ${
                  sortMode === s.key ? "bg-[var(--accent)] text-black" : "text-white/50 hover:text-white/80"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {sortMode === "category" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs uppercase tracking-wide text-white/40">Jump to</span>
            {categories.map((cat) => (
              <button
                key={cat.name}
                type="button"
                onClick={() => scrollToCategory(cat.name)}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/50 transition-colors duration-150 hover:border-white/20 hover:text-white/80"
              >
                {cat.name === OTHER_CATEGORY ? "Other" : cat.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        className="overflow-x-auto shadow-lg shadow-black/30 backdrop-blur-md"
        style={{
          borderRadius: "var(--card-radius, 12px)",
          backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
          border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
        }}
      >
        <table className="w-full border-separate text-left text-sm" style={{ borderSpacing: "0 4px" }}>
          <thead>
            <tr className="text-xs uppercase tracking-wide text-white/50">
              <th className="px-3 pb-3 pt-4 font-medium">Statement</th>
              {segments.map((seg) => (
                <th key={seg} className="min-w-[104px] px-3 pb-3 pt-4 text-center font-medium">
                  {seg}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rankedRows
              ? rankedRows.map((row) => renderRow(row, true))
              : categories.map((cat, i) => (
                  <Fragment key={cat.name}>
                    <tr id={categoryAnchorId(cat.name)}>
                      <td
                        colSpan={segments.length + 1}
                        className={`px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)] ${i === 0 ? "pt-1" : "pt-6"}`}
                      >
                        {cat.name === OTHER_CATEGORY ? "Other statements" : cat.name}
                      </td>
                    </tr>
                    {cat.rows.map((row) => renderRow(row, false))}
                  </Fragment>
                ))}
          </tbody>
        </table>
      </div>

      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 max-w-[240px] rounded-lg border border-white/15 bg-neutral-900 px-3 py-2 text-xs leading-relaxed text-white/70 shadow-xl shadow-black/40"
          style={{ left: Math.min(tooltip.x + 14, window.innerWidth - 260), top: Math.min(tooltip.y + 14, window.innerHeight - 160) }}
        >
          <p className="mb-1 font-semibold text-white">{tooltip.row.segment}</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono tabular-nums">
            <dt className="font-sans text-white/40">Index</dt>
            <dd className="text-right">{tooltip.row.index_value ?? "—"}</dd>
            <dt className="font-sans text-white/40">Column %</dt>
            <dd className="text-right">{tooltip.row.column_pct != null ? `${tooltip.row.column_pct}%` : "—"}</dd>
            <dt className="font-sans text-white/40">Row %</dt>
            <dd className="text-right">{tooltip.row.row_pct != null ? `${tooltip.row.row_pct}%` : "—"}</dd>
            <dt className="font-sans text-white/40">Responses</dt>
            <dd className="text-right">{tooltip.row.responses ?? "—"}</dd>
            <dt className="font-sans text-white/40">Universe</dt>
            <dd className="text-right">{tooltip.row.universe ?? "—"}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: "heatmap" | "table"; onChange: (v: "heatmap" | "table") => void }) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 text-xs font-medium">
      {(["heatmap", "table"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-full px-3 py-1 capitalize transition-colors duration-150 ${
            view === v ? "bg-[var(--accent)] text-black" : "text-white/50 hover:text-white/80"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
