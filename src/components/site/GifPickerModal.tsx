"use client";

import { useRef, useState } from "react";
import { useClosableOverlay } from "@/hooks/useClosableOverlay";
import { searchGifsAction } from "@/app/s/[slug]/discussionActions";
import type { GifResult } from "@/lib/giphy";

/** A Giphy search picker for the Discussion composer — same shape as the
 * builder's ImageSearchModal, but simpler: Giphy's own URLs are meant to be
 * hotlinked directly (unlike Google Images results), so picking one just
 * hands back its URL, no server-side re-hosting needed. */
export function GifPickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (gif: GifResult) => void;
  onClose: () => void;
}) {
  const { closing, requestClose } = useClosableOverlay(onClose);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
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
    const result = await searchGifsAction(trimmed);
    if (requestId !== requestIdRef.current) return;
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

  function pick(gif: GifResult) {
    onSelect(gif);
    requestClose();
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={requestClose}
    >
      <div
        className={`flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden shadow-2xl backdrop-blur-xl ${
          closing ? "animate-modal-out" : "animate-modal-in"
        }`}
        style={{
          backgroundColor: "rgba(20,20,20,var(--card-bg-opacity, 0.4))",
          border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
          borderRadius: "var(--card-radius, 12px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <p className="text-sm font-semibold text-white">Search GIFs</p>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="flex shrink-0 gap-2 border-b border-white/10 px-5 py-3">
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
            placeholder="e.g. excited, mind blown"
            className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-[var(--accent)] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void runSearch()}
            disabled={!query.trim() || loading}
            className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition-transform disabled:opacity-50"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-5">
          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
          {!searched && !loading && (
            <p className="text-sm text-white/40">Search Giphy for a reaction GIF to attach to your post.</p>
          )}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {results.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => pick(g)}
                className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-white/5 transition-transform [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-0.5 hover:shadow-lg"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.previewUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
