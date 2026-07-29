"use client";

import { useId, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";
import { ImageSearchModal } from "@/components/builder/ImageSearchModal";
import { importImageFromUrl } from "@/app/builder/searchActions";
import type { ImageSearchResult } from "@/lib/googleImageSearch";
import { UPLOAD_BUTTON_CLASS, SEARCH_BUTTON_CLASS, PASTE_ZONE_CLASS, PASTE_ZONE_FOCUS_CLASS } from "@/components/builder/mediaActionStyles";

// A clipboard paste hands over the browser's own raw bitmap rendering of
// the copied image, not the (often already-compressed JPEG) file it
// originally came from — a photo that's a few MB as a saved file can paste
// in as a 30-40MB uncompressed PNG. Compression below is exactly what's
// supposed to bring a file like that back down, so this ceiling only needs
// to guard against genuinely pathological input, not gate out the ordinary
// large-paste case compression exists to handle.
const IMAGE_MAX_MB = 60;
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
  const [searching, setSearching] = useState(false);
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

  async function handleImagePicked(result: ImageSearchResult) {
    setSearching(false);
    setError(null);
    setUploading(true);
    // Downloaded and re-hosted server-side (see importImageFromUrl) rather
    // than pointing the site straight at the search result's own URL — that
    // third-party host can disappear, rate-limit, or block hotlinking at
    // any time, the same reasoning as re-hosting a pasted file.
    const uploadResult = await importImageFromUrl(result.original, artistSlug, slotName);
    setUploading(false);
    if (uploadResult.ok) {
      onChange(uploadResult.data);
    } else {
      setError(uploadResult.error);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-white/50">
        {label}
      </span>

      {value && (
        isVideoUrl ? (
          <video
            src={value}
            className="h-32 w-full rounded-lg border border-neutral-200 object-cover dark:border-white/10 lg:h-44 2xl:h-56"
            muted
            loop
            autoPlay
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            className="h-32 w-full rounded-lg border border-neutral-200 object-cover dark:border-white/10 lg:h-44 2xl:h-56"
          />
        )
      )}

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

      {/* Every field that adds media in this builder uses the same three
          colours for the same three actions: blue = upload a file, violet =
          search the web for one, dashed green = paste one in directly (see
          mediaActionStyles.ts) — so which button does what doesn't need
          re-learning field to field. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className={UPLOAD_BUTTON_CLASS}
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
            <path d="M10 12.5V3.5M10 3.5 6 7.5M10 3.5l4 4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 13v1.5A1.5 1.5 0 0 0 5.5 16h9a1.5 1.5 0 0 0 1.5-1.5V13" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {uploading ? "Uploading…" : value ? "Replace file" : "Upload file"}
        </button>
        <button
          type="button"
          disabled={uploading}
          onClick={() => setSearching(true)}
          className={SEARCH_BUTTON_CLASS}
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
            <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth={1.6} />
            <path d="m16 16-3.4-3.4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
          </svg>
          Search the web
        </button>
      </div>

      {/* Focusable + paste-listening, so clicking here then Cmd/Ctrl+V-ing a
          copied image uploads it straight in — no save-to-disk-then-browse
          round trip. Only images can arrive via clipboard paste (browsers
          don't hand over video files that way), so upload/search above are
          still how a video background gets in. Always visibly dashed
          (rather than only colouring up on focus) so it reads as its own
          distinct drop target from the outset, not a plain unstyled area. */}
      <div
        tabIndex={0}
        role="button"
        onPaste={handlePaste}
        onFocus={() => setPasteFocused(true)}
        onBlur={() => setPasteFocused(false)}
        className={`flex items-center gap-2 px-3 py-2.5 focus:outline-none ${PASTE_ZONE_CLASS} ${
          pasteFocused ? PASTE_ZONE_FOCUS_CLASS : ""
        }`}
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden>
          <rect x="5.5" y="3.5" width="9" height="13" rx="1.5" stroke="currentColor" strokeWidth={1.6} />
          <path d="M8 3.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v.5" stroke="currentColor" strokeWidth={1.6} />
          <path d="M8 10h4M8 12.5h4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        </svg>
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
          Click here, then paste an image (Ctrl/⌘+V)
        </span>
      </div>

      {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
      <p className="text-xs text-neutral-400 dark:text-white/40">
        Accepts an image or a video. Images are auto-compressed to fit {IMAGE_MAX_DIMENSION}px /
        ~2MB. Videos are capped at {VIDEO_MAX_MB}MB (compress heavy files before uploading —
        client-side transcoding isn&apos;t wired up).
      </p>
      {searching && (
        <ImageSearchModal onSelect={(r) => void handleImagePicked(r)} onClose={() => setSearching(false)} />
      )}
    </div>
  );
}
