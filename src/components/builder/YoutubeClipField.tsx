"use client";

import { useEffect, useId, useRef, useState } from "react";
import { loadYoutubeIframeApi, parseYoutubeVideoId, type YTPlayer } from "@/lib/youtubeIframeApi";

const MAX_CLIP_SECONDS = 10;

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** Paste a YouTube link, then pick a start/end point (max 10s span) from an
 * embedded preview player to use as a short looping background clip —
 * stored as just the video id + trim points, never a downloaded file (see
 * YoutubeBackgroundPlayer.tsx for why: that's YouTube's own embed player
 * doing the playback on the live site, not a re-encoded copy). */
export function YoutubeClipField({
  label,
  videoId,
  start,
  end,
  onChange,
}: {
  label: string;
  videoId: string | null;
  start: number;
  end: number | null;
  onChange: (videoId: string | null, start: number, end: number | null) => void;
}) {
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const mountId = useId().replace(/[:]/g, "");
  const playerRef = useRef<YTPlayer | null>(null);
  const previewPollRef = useRef<number | null>(null);

  const effectiveEnd = end ?? Math.min(start + MAX_CLIP_SECONDS, duration ?? start + MAX_CLIP_SECONDS);

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    loadYoutubeIframeApi().then((YT) => {
      if (cancelled) return;
      const el = document.getElementById(mountId);
      if (!el) return;
      playerRef.current = new YT.Player(el, {
        videoId,
        playerVars: { modestbranding: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: (e) => setDuration(e.target.getDuration()),
        },
      });
    });
    return () => {
      cancelled = true;
      if (previewPollRef.current) window.clearInterval(previewPollRef.current);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [videoId, mountId]);

  function handleUrlSubmit() {
    const id = parseYoutubeVideoId(urlInput);
    if (!id) {
      setUrlError("That doesn't look like a YouTube link.");
      return;
    }
    setUrlError(null);
    setUrlInput("");
    setDuration(null);
    onChange(id, 0, MAX_CLIP_SECONDS);
  }

  function setStart(next: number) {
    const clampedStart = Math.max(0, next);
    const clampedEnd = Math.min(clampedStart + MAX_CLIP_SECONDS, effectiveEnd < clampedStart ? clampedStart + MAX_CLIP_SECONDS : effectiveEnd, duration ?? Infinity);
    onChange(videoId, clampedStart, Math.max(clampedEnd, clampedStart + 1));
  }

  function setEnd(next: number) {
    const clampedEnd = Math.min(next, duration ?? next);
    const clampedStart = Math.max(0, clampedEnd - MAX_CLIP_SECONDS > start ? clampedEnd - MAX_CLIP_SECONDS : start);
    onChange(videoId, clampedStart, clampedEnd);
  }

  function applyCurrentTimeAs(which: "start" | "end") {
    const t = playerRef.current?.getCurrentTime();
    if (t === undefined) return;
    if (which === "start") setStart(t);
    else setEnd(t);
  }

  function previewClip() {
    const player = playerRef.current;
    if (!player) return;
    player.seekTo(start, true);
    player.playVideo();
    if (previewPollRef.current) window.clearInterval(previewPollRef.current);
    previewPollRef.current = window.setInterval(() => {
      if (player.getCurrentTime() >= effectiveEnd) {
        player.pauseVideo();
        if (previewPollRef.current) window.clearInterval(previewPollRef.current);
      }
    }, 200);
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-white/50">
        {label} (YouTube clip)
      </span>

      {videoId ? (
        <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-3 dark:border-white/10">
          <div id={mountId} className="aspect-video w-full overflow-hidden rounded-lg bg-black" />

          <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-white/60">
            <span>Start {formatSeconds(start)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(duration ?? MAX_CLIP_SECONDS * 10, 1)}
              step={0.5}
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => applyCurrentTimeAs("start")}
              className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-[11px] font-medium hover:bg-neutral-100 dark:border-white/15 dark:hover:bg-white/5"
            >
              Use now
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-white/60">
            <span>End {formatSeconds(effectiveEnd)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(duration ?? MAX_CLIP_SECONDS * 10, 1)}
              step={0.5}
              value={effectiveEnd}
              onChange={(e) => setEnd(Number(e.target.value))}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => applyCurrentTimeAs("end")}
              className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-[11px] font-medium hover:bg-neutral-100 dark:border-white/15 dark:hover:bg-white/5"
            >
              Use now
            </button>
          </div>

          <p className="text-xs text-neutral-400 dark:text-white/40">
            Clip length: {(effectiveEnd - start).toFixed(1)}s (max {MAX_CLIP_SECONDS}s — moving one
            handle drags the other along to stay within that span).
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={previewClip}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/5"
            >
              Preview clip
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(null, 0, null);
                setDuration(null);
              }}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              Remove clip
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              setUrlError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleUrlSubmit();
              }
            }}
            placeholder="Paste a YouTube link"
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm placeholder-neutral-400 focus:border-builder-accent focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder-white/30"
          />
          <button
            type="button"
            onClick={handleUrlSubmit}
            disabled={!urlInput.trim()}
            className="shrink-0 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/5"
          >
            Use
          </button>
        </div>
      )}
      {urlError && <p className="text-red-600 dark:text-red-400">{urlError}</p>}
    </div>
  );
}
