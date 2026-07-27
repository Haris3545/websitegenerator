"use client";

import { useId, useState } from "react";

/** An image field that accepts either the usual file picker or a straight
 * clipboard paste — click the box, Cmd/Ctrl+V a copied image straight in,
 * no save-to-disk-then-browse round trip. The parent owns compression and
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
    <div className="flex items-start gap-3">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-white/5 text-[10px] text-white/30">
          No image
        </div>
      )}

      <div
        tabIndex={0}
        role="button"
        onPaste={handlePaste}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-3 text-center text-xs transition-colors focus:outline-none ${
          focused ? "border-[var(--accent)] bg-white/[0.07]" : "border-white/15 bg-white/5"
        }`}
      >
        <span className="font-medium text-white/70">
          {compressing ? "Processing…" : "Click here, then paste an image"}
        </span>
        <span className="text-white/35">or</span>
        <label
          htmlFor={inputId}
          className="cursor-pointer rounded-full border border-white/15 bg-white/5 px-3 py-1 font-medium text-white/70 transition-colors hover:bg-white/10"
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
