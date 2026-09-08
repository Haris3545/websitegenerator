"use client";

import { useRef, useState } from "react";
import { uploadAudienceResearch } from "@/app/builder/actions";

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls"];

function hasAcceptedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function AudienceUploadField({
  artistId,
  onFileSelected,
}: {
  /** Null for a not-yet-created artist — there's no row to attach an upload
   * to yet, so the file is just staged (see onFileSelected) and actually
   * uploaded by the parent form once the artist exists. */
  artistId: string | null;
  onFileSelected?: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queuedName, setQueuedName] = useState<string | null>(null);
  // Counts drag enter/leave rather than toggling a boolean directly —
  // dragging over a child element inside the drop zone fires a leave on the
  // parent followed immediately by an enter, and toggling naively off that
  // leave flickers the highlight off and back on for every pixel the
  // pointer crosses a child boundary.
  const dragDepthRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setMessage(null);

    if (!artistId) {
      setQueuedName(file.name);
      onFileSelected?.(file);
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const result = await uploadAudienceResearch(artistId, formData);

    setUploading(false);
    if (result.ok) {
      setMessage(`Imported ${result.count} statement${result.count === 1 ? "" : "s"}.`);
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-white/50">
        Audience research (CSV or XLSX)
      </span>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        disabled={uploading}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          // Clears the input's own value so picking the exact same file
          // again (e.g. after fixing it and re-exporting under the same
          // name) still fires a change event instead of being a no-op.
          e.target.value = "";
        }}
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !uploading) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepthRef.current += 1;
          if (!uploading) setIsDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepthRef.current = 0;
          setIsDragging(false);
          if (uploading) return;
          const file = e.dataTransfer.files?.[0];
          if (!file) return;
          if (!hasAcceptedExtension(file.name)) {
            setError(`"${file.name}" isn't a .csv, .xlsx, or .xls file.`);
            return;
          }
          handleFile(file);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors duration-150 ${
          isDragging
            ? "border-builder-accent bg-builder-accent/10"
            : "border-neutral-300 hover:border-neutral-400 dark:border-white/15 dark:hover:border-white/30"
        }`}
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 text-neutral-400 dark:text-white/40" aria-hidden>
          <path
            d="M10 13V4M10 4 6.5 7.5M10 4l3.5 3.5"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4 13v1.5A1.5 1.5 0 0 0 5.5 16h9a1.5 1.5 0 0 0 1.5-1.5V13"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="text-sm font-medium text-neutral-700 dark:text-white/80">
          {uploading ? "Uploading…" : "Drag a spreadsheet here, or click to browse"}
        </p>
        {queuedName && !uploading && (
          <p className="text-xs text-neutral-500 dark:text-white/50">
            Queued: {queuedName} — imported once you create this artist below.
          </p>
        )}
      </div>
      {message && <p className="text-xs text-emerald-600 dark:text-emerald-400">{message}</p>}
      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}
      <p className="text-xs text-neutral-400 dark:text-white/40">
        A raw GWI crosstab export (Question/Name/Metric rows, one column per audience) is converted
        automatically. A simpler flat spreadsheet works too — just needs columns recognizable as
        &quot;statement&quot; and &quot;segment&quot; (or &quot;audience&quot;); universe/responses/column
        %/row %/index are picked up if present. Each upload adds to the existing set rather than
        replacing it.
      </p>
    </div>
  );
}
