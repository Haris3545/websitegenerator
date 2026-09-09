"use client";

import { Fragment, useMemo, useState } from "react";
import type { Database } from "@/lib/database.types";
import { AudienceTable } from "@/components/site/AudienceTable";
import { classifyStatement, sortCategoryNames, OTHER_CATEGORY } from "@/lib/audienceCategories";

type Statement = Database["public"]["Tables"]["audience_statements"]["Row"];
type Metric = "index_value" | "column_pct" | "row_pct" | "responses";

const METRICS: { key: Metric; label: string }[] = [
  { key: "index_value", label: "Index" },
  { key: "column_pct", label: "Column %" },
  { key: "row_pct", label: "Row %" },
  { key: "responses", label: "Responses" },
];

interface HeatmapRow {
  statement: string;
  category: string;
  bySegment: Map<string, Statement>;
}

/** Diverging scale centred on an index of 100 (the "no more or less likely
 * than the general population" baseline) — blue below it, orange above.
 * Lightness is capped at both ends so white cell text stays legible even at
 * the most extreme index values in a given upload. */
function indexToBackground(index: number): string {
  const t = Math.max(-1, Math.min(1, (index - 100) / 100));
  const cold: [number, number, number] = [59, 130, 246];
  const warm: [number, number, number] = [242, 102, 29];
  const mid: [number, number, number] = [255, 255, 255];
  const target = t < 0 ? cold : warm;
  const k = 0.16 + Math.abs(t) * 0.5;
  const rgb = target.map((v, i) => Math.round(mid[i] + (v - mid[i]) * k));
  return `rgb(${rgb.join(",")})`;
}

function formatMetric(row: Statement, metric: Metric): string {
  if (metric === "column_pct" || metric === "row_pct") {
    const v = row[metric];
    return v == null ? "—" : `${v}%`;
  }
  const v = row[metric];
  return v == null ? "—" : String(v);
}

export function AudienceHeatmap({ statements }: { statements: Statement[] }) {
  const [view, setView] = useState<"heatmap" | "table">("heatmap");
  const [metric, setMetric] = useState<Metric>("index_value");
  const [tooltip, setTooltip] = useState<{ x: number; y: number; row: Statement } | null>(null);

  const segments = useMemo(() => Array.from(new Set(statements.map((s) => s.segment))).sort(), [statements]);

  const categories = useMemo(() => {
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

    const byCategory = new Map<string, HeatmapRow[]>();
    for (const row of rowsByKey.values()) {
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
  }, [statements]);

  function showTooltip(e: React.MouseEvent, row: Statement) {
    setTooltip({ x: e.clientX, y: e.clientY, row });
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
            <span>Under-index</span>
            <span
              className="h-2 w-24 rounded-full"
              style={{ background: "linear-gradient(90deg, rgb(59,130,246), rgba(255,255,255,0.15) 50%, rgb(242,102,29))" }}
            />
            <span>Over-index</span>
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
            {categories.map((cat, i) => (
              <Fragment key={cat.name}>
                <tr>
                  <td
                    colSpan={segments.length + 1}
                    className={`px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)] ${i === 0 ? "pt-1" : "pt-6"}`}
                  >
                    {cat.name === OTHER_CATEGORY ? "Other statements" : cat.name}
                  </td>
                </tr>
                {cat.rows.map((row) => (
                  <tr key={`${cat.name}-${row.statement}`}>
                    <td className="px-3 py-1 align-middle text-white/70">
                      {/* A fixed width (not max-width) on the inner span, rather than
                          `truncate` on the td itself, since a td in an auto-layout table
                          doesn't reliably enforce a max-width — the column just grows to
                          fit the text instead, which was pushing every row after a long
                          statement into the next category's header. */}
                      <span className="block w-[260px] overflow-hidden text-ellipsis whitespace-nowrap" title={row.statement}>
                        {row.statement}
                      </span>
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
                            style={{ backgroundColor: indexToBackground(cell.index_value ?? 100) }}
                          >
                            {formatMetric(cell, metric)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
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
