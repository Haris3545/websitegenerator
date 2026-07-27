"use client";

import { useId, useRef, useState, useTransition } from "react";
import imageCompression from "browser-image-compression";
import { addIdeaCard, updateIdeaCard } from "@/app/s/[slug]/actions";
import { useClosableOverlay } from "@/hooks/useClosableOverlay";
import type { BoardItem } from "@/lib/database.types";

const IMAGE_MAX_DIMENSION = 1600;

const fieldClass =
  "rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white transition-colors focus:border-[var(--accent)] focus:bg-white/[0.07] focus:outline-none [color-scheme:dark]";
const labelClass = "text-xs font-medium uppercase tracking-wide text-white/45";

/** The "new idea" / "edit idea" form — elegant, dark, matches the rest of
 * the site's card styling. Images are compressed client-side before upload
 * (see MediaUploadField.tsx for the same pattern) so a phone photo doesn't
 * balloon storage or slow the stack down. */
export function IdeaFormModal({
  artistId,
  slug,
  item,
  onClose,
  onSaved,
}: {
  artistId: string;
  slug: string;
  item?: BoardItem;
  onClose: () => void;
  onSaved: (item: BoardItem) => void;
}) {
  const isEdit = !!item;
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [timeline, setTimeline] = useState(item?.timeline ?? "");
  const [preview, setPreview] = useState<string | null>(item?.image_url ?? null);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<File | null>(null);
  const inputId = useId();
  const { closing, requestClose } = useClosableOverlay(onClose);

  async function handleFileChange(file: File) {
    setError(null);
    setCompressing(true);
    try {
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: IMAGE_MAX_DIMENSION,
        maxSizeMB: 1,
        useWebWorker: true,
        fileType: file.type === "image/png" ? "image/png" : "image/webp",
      });
      fileRef.current = compressed;
      setPreview(URL.createObjectURL(compressed));
    } catch {
      setError("Couldn't process that image — try a different file.");
    } finally {
      setCompressing(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give the idea a title.");
      return;
    }
    setError(null);
    const formData = new FormData();
    formData.set("title", title.trim());
    formData.set("body", body.trim());
    formData.set("timeline", timeline.trim());
    if (fileRef.current) formData.set("image", fileRef.current);

    startTransition(async () => {
      const result = isEdit
        ? await updateIdeaCard(item!.id, slug, formData)
        : await addIdeaCard(artistId, slug, formData);
      if (result.ok) {
        onSaved(result.item);
        requestClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={requestClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/15 bg-neutral-950 text-white shadow-2xl shadow-black/50 ${
          closing ? "animate-modal-out" : "animate-modal-in"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
          <p className="text-base font-semibold">{isEdit ? "Edit idea" : "New idea"}</p>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="custom-scrollbar flex flex-col gap-4 overflow-y-auto px-6 py-5">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Image</span>
            <div className="flex items-center gap-3">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-white/5 text-[10px] text-white/30">
                  No image
                </div>
              )}
              <label
                htmlFor={inputId}
                className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10"
              >
                {compressing ? "Compressing…" : preview ? "Replace photo" : "Choose photo"}
              </label>
              <input
                id={inputId}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFileChange(file);
                }}
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className={fieldClass}
              placeholder="e.g. Fitting room confessionals"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Description</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className={`${fieldClass} resize-none`}
              placeholder="What's the idea, and why does it work?"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className={labelClass}>Timeline / lead time</span>
            <input
              value={timeline}
              onChange={(e) => setTimeline(e.target.value)}
              className={fieldClass}
              placeholder="e.g. 10 days"
            />
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-white/60 transition-colors hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || compressing}
            className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-black transition-transform duration-150 ease-out hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
          >
            {isPending ? "Saving..." : isEdit ? "Save changes" : "Add idea"}
          </button>
        </div>
      </form>
    </div>
  );
}
