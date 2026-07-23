"use client";

import { useState } from "react";
import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";

const IMAGE_MAX_MB = 10;
const IMAGE_MAX_DIMENSION = 2560; // sharp on a large TV, without shipping an oversized file
const VIDEO_MAX_MB = 100;

export function MediaUploadField({
  label,
  kind,
  artistSlug,
  value,
  onChange,
}: {
  label: string;
  kind: "image" | "video";
  artistSlug: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);

    if (kind === "video" && file.size > VIDEO_MAX_MB * 1024 * 1024) {
      setError(`Video must be under ${VIDEO_MAX_MB}MB.`);
      return;
    }
    if (kind === "image" && file.size > IMAGE_MAX_MB * 1024 * 1024) {
      setError(`Image must be under ${IMAGE_MAX_MB}MB before compression.`);
      return;
    }

    setUploading(true);
    try {
      let uploadFile: File = file;
      if (kind === "image") {
        uploadFile = await imageCompression(file, {
          maxWidthOrHeight: IMAGE_MAX_DIMENSION,
          maxSizeMB: 2,
          useWebWorker: true,
          fileType: file.type === "image/png" ? "image/png" : "image/webp",
        });
      }

      const supabase = createClient();
      const ext = uploadFile.name.split(".").pop() || (kind === "image" ? "webp" : "mp4");
      const path = `${artistSlug}/${kind === "image" ? "background" : "landing"}.${ext}`;

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
      {value && kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="h-32 w-full rounded object-cover" />
      )}
      {value && kind === "video" && (
        <video src={value} className="h-32 w-full rounded object-cover" muted loop autoPlay />
      )}
      <input
        type="file"
        accept={kind === "image" ? "image/*" : "video/*"}
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      {uploading && <p className="text-neutral-900">Compressing and uploading...</p>}
      {error && <p className="text-red-600">{error}</p>}
      <p className="text-xs text-neutral-900">
        {kind === "image"
          ? `Images are auto-compressed to fit ${IMAGE_MAX_DIMENSION}px / ~2MB — no need to resize beforehand.`
          : `Videos are capped at ${VIDEO_MAX_MB}MB (client-side transcoding isn't wired up yet — compress heavy files before uploading).`}
      </p>
    </div>
  );
}
