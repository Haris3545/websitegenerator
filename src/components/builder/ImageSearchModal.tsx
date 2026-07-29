"use client";

import { useRef, useState } from "react";
import { useClosableOverlay } from "@/hooks/useClosableOverlay";
import { searchImagesAction } from "@/app/builder/searchActions";
import type { ImageSearchResult } from "@/lib/googleImageSearch";

/** A picker over Google Images (via SerpApi) — search, browse a thumbnail
 * grid, click one to hand it back to the caller. Search only fires on
 * submit (not per keystroke) since each query spends against SERPAPI_KEY's
 * paid quota, same reasoning as the rest of this app's Gemini-throttling. */
export function ImageSearchModal({
  onSelect,
  onClose,
}: {
  onSelect: (result: ImageSearchResult) => void;
  onClose: () => void;
}) {
  const { closing, requestClose } = useClosableOverlay(onClose);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ImageSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const requestIdRef = useRef(0);

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
        className={`flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-white/10 dark:bg-neutral-900 ${
          closing ? "animate-modal-out" : "animate-modal-in"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-white/10">
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">Search images</p>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="flex shrink-0 gap-2 border-b border-neutral-200 px-5 py-3 dark:border-white/10">
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
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm placeholder-neutral-400 focus:border-builder-accent focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder-white/30"
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
            <p className="text-sm text-neutral-400 dark:text-white/40">
              Search for anything — the image you pick becomes the background.
            </p>
          )}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {results.map((r, i) => (
              <button
                key={`${r.original}-${i}`}
                type="button"
                onClick={() => onSelect(r)}
                title={r.title}
                className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 transition-transform hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-white/5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.thumbnail}
                  alt={r.title}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                <span className="absolute inset-x-0 bottom-0 translate-y-full bg-black/70 px-1.5 py-1 text-[10px] text-white transition-transform group-hover:translate-y-0 line-clamp-2">
                  {r.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
