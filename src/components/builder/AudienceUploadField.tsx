"use client";

import { useRef, useState } from "react";
import { uploadAudienceResearch } from "@/app/builder/actions";

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
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="self-start rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/5"
      >
        {uploading ? "Uploading..." : queuedName ? "Replace file" : "Upload spreadsheet"}
      </button>
      {queuedName && (
        <p className="text-xs text-neutral-500 dark:text-white/50">
          Queued: {queuedName} — imported once you create this artist below.
        </p>
      )}
      {message && <p className="text-xs text-emerald-600 dark:text-emerald-400">{message}</p>}
      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}
      <p className="text-xs text-neutral-400 dark:text-white/40">
        Needs a header row with columns recognizable as &quot;statement&quot; and
        &quot;segment&quot; (or &quot;audience&quot;) — other GWI-style columns like
        universe/responses/column %/row %/index are picked up automatically if present. Each
        upload adds to the existing set rather than replacing it.
      </p>
    </div>
  );
}
