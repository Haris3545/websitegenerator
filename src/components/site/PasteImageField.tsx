"use client";

import { useId, useState } from "react";

/** An image field that accepts either the usual file picker or a straight
 * clipboard paste — click the box, Cmd/Ctrl+V a copied image straight in,
 * no save-to-disk-then-browse round trip. One consistently-sized box
 * either way (rather than a small square preview sitting next to a
 * differently-shaped upload box), so swapping between "no image yet" and
 * "here's the image" doesn't jump around. The parent owns compression and
 * the actual preview URL (see IdeaFormModal.tsx/TacticFormModal.tsx for the
 * browser-image-compression step); this only turns either input path into
 * the same `File` and hands it back via onFile. */
export function PasteImageField({
  preview,
  compressing,
  onFile,
}: {
  preview: string | null;
  compressing: boolean;
  onFile: (file: File) => void;
}) {
  const inputId = useId();
  const [focused, setFocused] = useState(false);

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          onFile(file);
        }
        return;
      }
    }
  }

  return (
    <div
      tabIndex={0}
      role="button"
      onPaste={handlePaste}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={`relative flex h-28 w-full items-center justify-center overflow-hidden rounded-lg border bg-white/5 transition-colors focus:outline-none ${
        focused ? "border-[var(--accent)] bg-white/[0.07]" : "border-white/15"
      }`}
    >
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <div
        className={`relative flex flex-col items-center gap-1 text-center text-xs ${
          preview ? "bg-black/55 px-3 py-2" : ""
        }`}
        style={preview ? { borderRadius: "var(--card-radius, 8px)" } : undefined}
      >
        <span className="font-medium text-white/80">
          {compressing ? "Processing…" : "Click here, then paste an image"}
        </span>
        <span className="text-white/40">or</span>
        <label
          htmlFor={inputId}
          className="cursor-pointer rounded-full border border-white/20 bg-black/30 px-3 py-1 font-medium text-white/80 transition-colors hover:bg-black/50"
        >
          {preview ? "Replace photo" : "Choose photo"}
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />
      </div>
    </div>
  );
}
