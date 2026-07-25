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
      <span>Audience research (CSV or XLSX)</span>
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
        className="self-start rounded border border-neutral-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        {uploading ? "Uploading..." : queuedName ? "Replace file" : "Upload spreadsheet"}
      </button>
      {queuedName && (
        <p className="text-xs text-neutral-900">
          Queued: {queuedName} — imported once you create this artist below.
        </p>
      )}
      {message && <p className="text-xs text-green-700">{message}</p>}
      {error && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
      <p className="text-xs text-neutral-900">
        Needs a header row with columns recognizable as &quot;statement&quot; and
        &quot;segment&quot; (or &quot;audience&quot;) — other GWI-style columns like
        universe/responses/column %/row %/index are picked up automatically if present. Each
        upload adds to the existing set rather than replacing it.
      </p>
    </div>
  );
}
