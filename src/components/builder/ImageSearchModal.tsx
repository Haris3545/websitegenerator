"use client";

import { useRef, useState } from "react";
import { useClosableOverlay } from "@/hooks/useClosableOverlay";
import { searchImagesAction } from "@/app/builder/searchActions";
import type { ImageSearchResult } from "@/lib/googleImageSearch";

/** A picker over Google Images (via SerpApi) — search, browse a thumbnail
 * grid, click one to hand it back to the caller. Search only fires on
 * submit (not per keystroke) since each query spends against SERPAPI_KEY's
 * paid quota, same reasoning as the rest of this app's Gemini-throttling.
 *
 * onSelect actually attempts the download+import server-side (the thumbnail
 * shown here is never the real file) and reports back whether it worked —
 * a fair few SerpApi results turn out, once fetched for real, to not be an
 * image at all (an HTML page, a dead hotlink, etc.). Rather than surfacing
 * that as an error someone has to read and dismiss before trying again, a
 * failed pick just vanishes from the grid and the modal stays open on
 * whatever's left, so picking a working one instead never has any dead-end
 * in between. */
export function ImageSearchModal({
  onSelect,
  onClose,
  dark = false,
  helperText = "Search for anything — the image you pick becomes the background.",
}: {
  onSelect: (result: ImageSearchResult) => Promise<boolean>;
  onClose: () => void;
  /** Forces the dark palette unconditionally instead of following the
   * builder's light/dark toggle (which only works via a `.dark` class on
   * `<html>`) — the artist-facing site never sets that class, it's just
   * always dark, so this modal rendered its `dark:`-prefixed Tailwind
   * classes' light-mode fallback there: a white box with inherited white
   * text from the site root, i.e. invisible text in the search field. */
  dark?: boolean;
  helperText?: string;
}) {
  const { closing, requestClose } = useClosableOverlay(onClose);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ImageSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  async function pick(result: ImageSearchResult, key: string) {
    if (importingKey) return;
    setImportingKey(key);
    const ok = await onSelect(result);
    if (!ok) {
      setResults((prev) => prev.filter((r, i) => `${r.original}-${i}` !== key));
      setImportingKey(null);
    }
    // On success the caller closes the modal itself, so there's nothing
    // left here to reset importingKey for.
  }

  async function runSearch() {
    const trimmed = query.trim();
    if (!trimmed || loading) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    const result = await searchImagesAction(trimmed);
    if (requestId !== requestIdRef.current) return; // a newer search superseded this one
    setLoading(false);
    setSearched(true);
    if (result.ok) {
      setResults(result.data);
      if (result.data.length === 0) setError("No results — try a different search.");
    } else {
      setResults([]);
      setError(result.error);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={requestClose}
    >
      <div
        className={`flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border shadow-2xl ${
          dark ? "border-white/10 bg-neutral-900" : "border-neutral-200 bg-white dark:border-white/10 dark:bg-neutral-900"
        } ${closing ? "animate-modal-out" : "animate-modal-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4 ${
            dark ? "border-white/10" : "border-neutral-200 dark:border-white/10"
          }`}
        >
          <p className={`text-sm font-semibold ${dark ? "text-white" : "text-neutral-900 dark:text-white"}`}>
            Search images
          </p>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className={`flex h-8 w-8 items-center justify-center rounded-full text-lg transition-colors ${
              dark
                ? "text-white/40 hover:bg-white/10 hover:text-white"
                : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white"
            }`}
          >
            ×
          </button>
        </div>

        <div
          className={`flex shrink-0 gap-2 border-b px-5 py-3 ${
            dark ? "border-white/10" : "border-neutral-200 dark:border-white/10"
          }`}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runSearch();
              }
            }}
            placeholder="e.g. neon city skyline at night"
            className={`flex-1 rounded-lg border px-3 py-2 text-sm focus:border-builder-accent focus:outline-none ${
              dark
                ? "border-white/15 bg-white/5 text-white placeholder-white/30"
                : "border-neutral-300 bg-white text-neutral-900 placeholder-neutral-400 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder-white/30"
            }`}
          />
          <button
            type="button"
            onClick={() => void runSearch()}
            disabled={!query.trim() || loading}
            className="shrink-0 rounded-lg bg-builder-accent px-4 py-2 text-sm font-semibold text-black transition-transform disabled:opacity-50"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-5">
          {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          {!searched && !loading && (
            <p className={`text-sm ${dark ? "text-white/40" : "text-neutral-400 dark:text-white/40"}`}>
              {helperText}
            </p>
          )}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {results.map((r, i) => {
              const key = `${r.original}-${i}`;
              const busy = importingKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => void pick(r, key)}
                  disabled={!!importingKey}
                  title={r.title}
                  className={`group relative aspect-square overflow-hidden rounded-lg border transition-transform hover:-translate-y-0.5 hover:shadow-lg disabled:hover:translate-y-0 disabled:hover:shadow-none ${
                    dark ? "border-white/10 bg-white/5" : "border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-white/5"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.thumbnail}
                    alt={r.title}
                    loading="lazy"
                    className={`h-full w-full object-cover transition-opacity ${busy ? "opacity-40" : ""}`}
                  />
                  {busy && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="block h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white/90" />
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 translate-y-full bg-black/70 px-1.5 py-1 text-[10px] text-white transition-transform group-hover:translate-y-0 line-clamp-2">
                    {r.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
