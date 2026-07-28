"use client";

import { useId, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";

const IMAGE_MAX_MB = 10;
const IMAGE_MAX_DIMENSION = 2560; // sharp on a large TV, without shipping an oversized file
const VIDEO_MAX_MB = 100;

export function MediaUploadField({
  label,
  slotName,
  artistSlug,
  value,
  onChange,
}: {
  label: string;
  /** Storage filename stem for this slot, e.g. "background" or
   * "gate-background" — kept distinct per slot even though both now accept
   * either media kind. */
  slotName: string;
  artistSlug: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteFocused, setPasteFocused] = useState(false);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const isVideoUrl = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(value ?? "");

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          void handleFile(file);
        }
        return;
      }
    }
  }

  async function handleFile(file: File) {
    setError(null);
    const isVideo = file.type.startsWith("video/");

    if (isVideo && file.size > VIDEO_MAX_MB * 1024 * 1024) {
      setError(`Video must be under ${VIDEO_MAX_MB}MB.`);
      return;
    }
    if (!isVideo && file.size > IMAGE_MAX_MB * 1024 * 1024) {
      setError(`Image must be under ${IMAGE_MAX_MB}MB before compression.`);
      return;
    }

    setUploading(true);
    try {
      let uploadFile: File = file;
      if (!isVideo) {
        uploadFile = await imageCompression(file, {
          maxWidthOrHeight: IMAGE_MAX_DIMENSION,
          maxSizeMB: 2,
          useWebWorker: true,
          fileType: file.type === "image/png" ? "image/png" : "image/webp",
        });
      }

      const supabase = createClient();
      const ext = uploadFile.name.split(".").pop() || (isVideo ? "mp4" : "webp");
      const path = `${artistSlug}/${slotName}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("artist-media")
        .upload(path, uploadFile, { upsert: true, contentType: uploadFile.type });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("artist-media").getPublicUrl(path);
      // The storage path is fixed per slot (upsert: true overwrites the same
      // object each time), so getPublicUrl returns the exact same string as
      // before a replace — nothing about the <img>/<video> src prop changed,
      // so neither React nor the browser's own image cache had any reason to
      // re-fetch, and the old file kept showing despite the new one being
      // uploaded. A cache-busting query param makes every upload produce a
      // genuinely different URL.
      onChange(`${data.publicUrl}?t=${Date.now()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-white/50">
        {label}
      </span>
      {/* Focusable + paste-listening, so clicking here then Cmd/Ctrl+V-ing a
          copied image uploads it straight in — no save-to-disk-then-browse
          round trip. Only images can arrive via clipboard paste (browsers
          don't hand over video files that way), so the file picker below is
          still how a video background gets in. */}
      <div
        tabIndex={0}
        role="button"
        onPaste={handlePaste}
        onFocus={() => setPasteFocused(true)}
        onBlur={() => setPasteFocused(false)}
        className={`flex flex-col gap-2 rounded-lg border p-2 transition-colors focus:outline-none ${
          pasteFocused
            ? "border-[var(--accent,theme(colors.neutral.400))] bg-neutral-50 dark:bg-white/[0.04]"
            : "border-transparent"
        }`}
      >
        {value &&
          (isVideoUrl ? (
            <video
              src={value}
              className="h-32 w-full rounded-lg border border-neutral-200 object-cover dark:border-white/10"
              muted
              loop
              autoPlay
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt=""
              className="h-32 w-full rounded-lg border border-neutral-200 object-cover dark:border-white/10"
            />
          ))}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*,video/*"
          disabled={uploading}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="self-start rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/5"
          >
            {uploading ? "Uploading..." : value ? "Replace file" : "Choose file"}
          </button>
          <span className="text-xs text-neutral-400 dark:text-white/40">
            or click here and paste an image
          </span>
        </div>
      </div>
      {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
      <p className="text-xs text-neutral-400 dark:text-white/40">
        Accepts an image or a video. Images are auto-compressed to fit {IMAGE_MAX_DIMENSION}px /
        ~2MB. Videos are capped at {VIDEO_MAX_MB}MB (compress heavy files before uploading —
        client-side transcoding isn&apos;t wired up).
      </p>
    </div>
  );
}
