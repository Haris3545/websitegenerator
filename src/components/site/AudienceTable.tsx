"use client";

import { useMemo, useState } from "react";
import type { Database } from "@/lib/database.types";

type Statement = Database["public"]["Tables"]["audience_statements"]["Row"];

export function AudienceTable({ statements }: { statements: Statement[] }) {
  const segments = useMemo(
    () => Array.from(new Set(statements.map((s) => s.segment))).sort(),
    [statements]
  );
  const [activeSegment, setActiveSegment] = useState<string | "all">("all");

  const rows = useMemo(() => {
    const filtered =
      activeSegment === "all" ? statements : statements.filter((s) => s.segment === activeSegment);
    return [...filtered].sort((a, b) => (b.index_value ?? 0) - (a.index_value ?? 0));
  }, [statements, activeSegment]);

  function pill(active: boolean) {
    return `rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150 ease-out hover:-translate-y-0.5 ${
      active
        ? "border-[var(--accent)] bg-[var(--accent)] text-black"
        : "border-[var(--accent)]/50 text-[var(--accent)] hover:border-[var(--accent)]"
    }`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setActiveSegment("all")} className={pill(activeSegment === "all")}>
          All segments
        </button>
        {segments.map((seg) => (
          <button
            key={seg}
            type="button"
            onClick={() => setActiveSegment(seg)}
            className={pill(activeSegment === seg)}
          >
            {seg}
          </button>
        ))}
      </div>

      <div
        className="overflow-x-auto shadow-lg shadow-black/30 backdrop-blur-md"
        style={{
          borderRadius: "var(--card-radius, 12px)",
          backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
          border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
        }}
      >
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/50">
              <th className="p-3">Statement</th>
              <th className="p-3">Segment</th>
              <th className="p-3 text-right">Universe</th>
              <th className="p-3 text-right">Responses</th>
              <th className="p-3 text-right">Column %</th>
              <th className="p-3 text-right">Row %</th>
              <th className="p-3 text-right">Index</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr
                key={s.id}
                className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.03]"
              >
                <td className="p-3 text-white">{s.statement}</td>
                <td className="p-3 text-white/60">{s.segment}</td>
                <td className="p-3 text-right text-white/70">{s.universe ?? "—"}</td>
                <td className="p-3 text-right text-white/70">{s.responses ?? "—"}</td>
                <td className="p-3 text-right text-white/70">
                  {s.column_pct != null ? `${s.column_pct}%` : "—"}
                </td>
                <td className="p-3 text-right text-white/70">
                  {s.row_pct != null ? `${s.row_pct}%` : "—"}
                </td>
                <td
                  className="p-3 text-right font-semibold"
                  style={{ color: (s.index_value ?? 0) >= 100 ? "#22c55e" : "#fff" }}
                >
                  {s.index_value ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
