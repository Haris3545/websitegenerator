"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadAudienceResearch, getAudienceUploads, removeAudienceUpload } from "@/app/builder/actions";

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls"];

function hasAcceptedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

type UploadRow = { id: string; filename: string; uploadedAt: string; count: number };

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
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refreshUploads = useCallback(() => {
    if (!artistId) return;
    getAudienceUploads(artistId).then(setUploads);
  }, [artistId]);

  // Nothing to list until the artist row (and therefore any of its uploads)
  // exists — refreshes again whenever a new artist gets its first id
  // assigned by the parent's autosave, and after every upload/delete below.
  useEffect(() => {
    refreshUploads();
  }, [refreshUploads]);

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
      refreshUploads();
    } else {
      setError(result.error);
    }
  }

  async function handleDelete(upload: UploadRow) {
    if (!artistId) return;
    if (!window.confirm(`Remove "${upload.filename}" and its ${upload.count} statement${upload.count === 1 ? "" : "s"}?`)) {
      return;
    }
    setDeletingId(upload.id);
    const result = await removeAudienceUpload(upload.id, artistId);
    setDeletingId(null);
    if (result.ok) {
      setUploads((prev) => prev.filter((u) => u.id !== upload.id));
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

      {uploads.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-neutral-200 dark:border-white/10">
          {uploads.map((u, i) => (
            <li
              key={u.id}
              className={`flex items-center justify-between gap-3 px-3 py-2 text-xs ${
                i > 0 ? "border-t border-neutral-200 dark:border-white/10" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-neutral-700 dark:text-white/80">{u.filename}</p>
                <p className="text-neutral-400 dark:text-white/40">
                  {new Date(u.uploadedAt).toLocaleDateString()} · {u.count} statement{u.count === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(u)}
                disabled={deletingId === u.id}
                className="shrink-0 rounded-md px-2 py-1 font-medium text-red-600 transition-colors duration-150 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                {deletingId === u.id ? "Removing…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
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
