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
  /** Storage filename stem for this slot, e.g. "background" or "landing" —
   * kept distinct per slot even though both now accept either media kind. */
  slotName: string;
  artistSlug: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const isVideoUrl = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(value ?? "");

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
      onChange(data.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <span>{label}</span>
      {value &&
        (isVideoUrl ? (
          <video src={value} className="h-32 w-full rounded object-cover" muted loop autoPlay />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-32 w-full rounded object-cover" />
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
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="self-start rounded border border-neutral-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        {uploading ? "Uploading..." : value ? "Replace file" : "Choose file"}
      </button>
      {error && <p className="text-red-600">{error}</p>}
      <p className="text-xs text-neutral-900">
        Accepts an image or a video. Images are auto-compressed to fit {IMAGE_MAX_DIMENSION}px /
        ~2MB. Videos are capped at {VIDEO_MAX_MB}MB (compress heavy files before uploading —
        client-side transcoding isn&apos;t wired up).
      </p>
    </div>
  );
}
