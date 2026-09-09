"use client";

import { useRef, useState } from "react";
import { useClosableOverlay } from "@/hooks/useClosableOverlay";
import { searchYoutubeVideosAction } from "@/app/builder/searchActions";
import type { YoutubeVideoSearchResult } from "@/lib/youtube";

/** A picker over YouTube search results — search, browse a results list
 * (thumbnail + title + channel), click one to hand its video id back to the
 * caller (YoutubeClipField opens the trimmer on it, same as pasting a URL
 * would). Search only fires on submit, not per keystroke, to go easy on
 * YOUTUBE_API_KEY's daily quota. */
export function YoutubeSearchModal({
  onSelect,
  onClose,
  initialQuery = "",
}: {
  onSelect: (result: YoutubeVideoSearchResult) => void;
  onClose: () => void;
  /** Pre-fills the search box (e.g. the artist's name) — search still only
   * ever fires on Enter/submit (see runSearch below), so this never spends
   * against YOUTUBE_API_KEY's quota on its own. */
  initialQuery?: string;
}) {
  const { closing, requestClose } = useClosableOverlay(onClose);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<YoutubeVideoSearchResult[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const requestIdRef = useRef(0);
  const activeQueryRef = useRef("");

  async function runSearch() {
    const trimmed = query.trim();
    if (!trimmed || loading) return;
    const requestId = ++requestIdRef.current;
    activeQueryRef.current = trimmed;
    setLoading(true);
    setError(null);
    const result = await searchYoutubeVideosAction(trimmed);
    if (requestId !== requestIdRef.current) return;
    setLoading(false);
    setSearched(true);
    if (result.ok) {
      setResults(result.data.videos);
      setNextPageToken(result.data.nextPageToken);
      if (result.data.videos.length === 0) setError("No results — try a different search.");
    } else {
      setResults([]);
      setNextPageToken(null);
      setError(result.error);
    }
  }

  async function loadMore() {
    if (!nextPageToken || loadingMore) return;
    const requestId = ++requestIdRef.current;
    setLoadingMore(true);
    setError(null);
    const result = await searchYoutubeVideosAction(activeQueryRef.current, nextPageToken);
    if (requestId !== requestIdRef.current) return;
    setLoadingMore(false);
    if (result.ok) {
      setResults((prev) => [...prev, ...result.data.videos]);
      setNextPageToken(result.data.nextPageToken);
    } else {
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
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">Search YouTube</p>
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
            placeholder="Search videos…"
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
              Search for a video — pick one to trim it down for the background.
            </p>
          )}
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <span className="block h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600 dark:border-white/20 dark:border-t-white/80" />
              <p className="text-sm text-neutral-400 dark:text-white/40">Searching…</p>
            </div>
          )}
          {!loading && (
            <div className="flex flex-col gap-2">
              {results.map((r) => (
                <button
                  key={r.videoId}
                  type="button"
                  onClick={() => onSelect(r)}
                  className="flex items-center gap-3 rounded-lg border border-neutral-200 p-2 text-left transition-colors hover:bg-neutral-50 dark:border-white/10 dark:hover:bg-white/5"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.thumbnail}
                    alt=""
                    loading="lazy"
                    className="h-14 w-24 shrink-0 rounded-md object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{r.title}</p>
                    <p className="truncate text-xs text-neutral-400 dark:text-white/40">{r.channelTitle}</p>
                  </div>
                </button>
              ))}
              {nextPageToken && (
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="mt-1 self-center rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/5"
                >
                  {loadingMore ? "Loading…" : "More"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
