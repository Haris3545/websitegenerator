"use client";

import Link from "next/link";
import { useTransition } from "react";
import { refreshEverything, logOutOfArtistSite } from "@/app/s/[slug]/actions";
import { useEditMode } from "@/components/site/EditModeContext";

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
  artistId,
  tagline,
  csvRows,
  csvFilename,
}: {
  slug: string;
  artistId: string;
  tagline: string;
  csvRows?: Record<string, unknown>[];
  csvFilename?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const { editMode, toggle, editingAllowed } = useEditMode();

  return (
    <footer className="mt-16 border-t-4 border-[var(--accent)] px-6 py-8 sm:px-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!csvRows?.length}
            onClick={() => csvRows && downloadCsv(csvRows, csvFilename ?? "export.csv")}
            className="rounded border border-white/30 px-3 py-1.5 text-xs font-medium text-white/80 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-white/60 disabled:pointer-events-none disabled:opacity-30"
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
            className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black transition-all duration-150 ease-out hover:-translate-y-0.5 hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
          >
            {isPending ? "Refreshing..." : "Refresh Everything"}
          </button>
        </div>
        <p className="text-xs text-white/40">{tagline}</p>
      </div>

      <div className="mt-8 flex justify-center gap-3">
        {editingAllowed && (
          <>
            <Link
              href={`/builder/artists/${artistId}`}
              className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-medium text-white/70 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-white/40 hover:text-white"
            >
              Edit this site
            </Link>
            <button
              type="button"
              onClick={toggle}
              className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-all duration-150 ease-out hover:-translate-y-0.5 ${
                editMode
                  ? "border-[var(--accent)] bg-[var(--accent)] text-black"
                  : "border-white/20 text-white/70 hover:border-white/40 hover:text-white"
              }`}
            >
              {editMode ? "Done editing" : "Edit page"}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => startTransition(() => logOutOfArtistSite(slug))}
          className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-medium text-white/70 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-white/40 hover:text-white"
        >
          Log out
        </button>
      </div>
    </footer>
  );
}
