"use client";

import { useTransition } from "react";
import { refreshEverything } from "@/app/s/[slug]/actions";

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ].join("\n");
}

function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SiteFooter({
  slug,
  brandName,
  tagline,
  csvRows,
  csvFilename,
}: {
  slug: string;
  brandName: string;
  tagline: string;
  csvRows?: Record<string, unknown>[];
  csvFilename?: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <footer className="mt-16 border-t-4 border-[var(--accent)] px-6 py-8 sm:px-10">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!csvRows?.length}
          onClick={() => csvRows && downloadCsv(csvRows, csvFilename ?? "export.csv")}
          className="rounded border border-white/30 px-3 py-1.5 text-xs font-medium text-white/80 hover:border-white/60 disabled:opacity-30"
        >
          Download as CSV
        </button>
        <button
          type="button"
          disabled
          title="Coming soon"
          className="rounded border border-white/20 px-3 py-1.5 text-xs font-medium text-white/40"
        >
          Download as DOCX
        </button>
        <button
          type="button"
          disabled
          title="Coming soon"
          className="rounded border border-white/20 px-3 py-1.5 text-xs font-medium text-white/40"
        >
          Download as XLSX
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => refreshEverything(slug))}
          className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
        >
          {isPending ? "Refreshing..." : "Refresh Everything"}
        </button>
      </div>
      <div className="mt-6 text-xs text-white/40">
        <p className="font-semibold text-white/60">{brandName}</p>
        <p>{tagline}</p>
      </div>
    </footer>
  );
}
