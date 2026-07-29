"use client";

import { useEffect, useRef, useState } from "react";
import { loadYoutubeIframeApi, parseYoutubeVideoId, type YTPlayer } from "@/lib/youtubeIframeApi";
import { YoutubeSearchModal } from "@/components/builder/YoutubeSearchModal";
import { VideoTrimTimeline } from "@/components/builder/VideoTrimTimeline";
import type { YoutubeVideoSearchResult } from "@/lib/youtube";
import { YOUTUBE_BUTTON_CLASS } from "@/components/builder/mediaActionStyles";
import { YoutubeIcon } from "@/components/builder/YoutubeIcon";

const MAX_CLIP_SECONDS = 10;

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

type Draft = { videoId: string; start: number; end: number };

/** Paste a YouTube link, pick a start/end point (max 10s span) from an
 * embedded preview player, then hit Confirm to lock it in — adjusting the
 * sliders is all local "draft" state until then, so scrubbing around
 * doesn't repeatedly commit half-chosen trim points to the saved artist
 * record; Cancel discards the draft and falls back to whatever was already
 * confirmed (or nothing). Stored as just the video id + trim points, never
 * a downloaded file (see YoutubeBackgroundPlayer.tsx for why: that's
 * YouTube's own embed player doing the playback on the live site, not a
 * re-encoded copy). */
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
  const [draft, setDraft] = useState<Draft | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const previewPollRef = useRef<number | null>(null);
  const playbackSyncPollRef = useRef<number | null>(null);
  const lastPolledTimeRef = useRef(0);

  useEffect(() => {
    if (!draft) return;
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    // Created imperatively rather than as a JSX element, so the YouTube
    // IFrame API is free to replace it with a live <iframe> (which is what
    // it does to whatever element it's given) without React ever trying to
    // remove that same node later. Confirming or cancelling the draft
    // unmounts this branch, and React reconciling a node that's already
    // been swapped out from under it threw an uncaught DOM exception
    // ("Failed to execute 'removeChild'") that crashed the whole page —
    // removing the stable `container` div instead (which was never itself
    // replaced) sidesteps that entirely.
    const mountEl = document.createElement("div");
    mountEl.className = "h-full w-full";
    container.appendChild(mountEl);

    loadYoutubeIframeApi().then((YT) => {
      if (cancelled) return;
      playerRef.current = new YT.Player(mountEl, {
        videoId: draft.videoId,
        playerVars: { modestbranding: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: (e) => {
            setDuration(e.target.getDuration());
            lastPolledTimeRef.current = e.target.getCurrentTime();
            // Scrubbing the video with YouTube's own control bar (much more
            // familiar than our custom ruler for "just find the moment")
            // should carry the trim window along with it. A deliberate seek
            // shows up as a large jump in currentTime between polls; normal
            // playback only advances it smoothly by roughly the poll
            // interval each tick — that distinction is what tells a manual
            // scrub apart from ordinary playback without needing a
            // dedicated "user seeked" event, which the IFrame API doesn't
            // expose. Skipped entirely for a short window after *our own*
            // seekPreview() calls, so dragging the timeline doesn't fight
            // itself through this same poll.
            playbackSyncPollRef.current = window.setInterval(() => {
              const player = playerRef.current;
              if (!player) return;
              const now = player.getCurrentTime();
              const delta = now - lastPolledTimeRef.current;
              lastPolledTimeRef.current = now;
              if (performance.now() - lastSeekAtRef.current < 500) return;
              if (Math.abs(delta) > 1.2) setDraftWindowStart(now);
            }, 250);
          },
        },
      });
    });
    return () => {
      cancelled = true;
      if (previewPollRef.current) window.clearInterval(previewPollRef.current);
      if (playbackSyncPollRef.current) window.clearInterval(playbackSyncPollRef.current);
      playerRef.current?.destroy();
      playerRef.current = null;
      container.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only (re)mount the player when the draft's video itself changes
  }, [draft?.videoId]);

  function beginUrlSubmit() {
    const id = parseYoutubeVideoId(urlInput);
    if (!id) {
      setUrlError("That doesn't look like a YouTube link.");
      return;
    }
    beginUrlOrSearchDraft(id);
  }

  function beginEdit() {
    if (!videoId) return;
    setDuration(null);
    setDraft({ videoId, start, end: end ?? start + MAX_CLIP_SECONDS });
  }

  function cancelDraft() {
    setDraft(null);
  }

  function confirmDraft() {
    if (!draft) return;
    onChange(draft.videoId, draft.start, draft.end);
    setDraft(null);
  }

  // Throttled rather than called on every single drag frame — YouTube's
  // player doesn't need (or want) a seekTo() call 60 times a second, and
  // this is purely a visual "show me where I'm trimming" preview, not
  // something that needs frame-perfect sync with the pointer.
  const lastSeekAtRef = useRef(0);
  const SEEK_THROTTLE_MS = 90;
  function seekPreview(t: number) {
    const player = playerRef.current;
    if (!player) return;
    const now = performance.now();
    if (now - lastSeekAtRef.current < SEEK_THROTTLE_MS) return;
    lastSeekAtRef.current = now;
    player.seekTo(t, true);
  }

  function setDraftStart(next: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const clampedStart = Math.max(0, next);
      const minEnd = clampedStart + 1;
      const maxEnd = clampedStart + MAX_CLIP_SECONDS;
      const clampedEnd = Math.min(Math.max(prev.end, minEnd), maxEnd, duration ?? maxEnd);
      seekPreview(clampedStart);
      return { ...prev, start: clampedStart, end: Math.max(clampedEnd, minEnd) };
    });
  }

  function setDraftEnd(next: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const clampedEnd = Math.min(next, duration ?? next);
      const clampedStart = Math.max(0, Math.max(prev.start, clampedEnd - MAX_CLIP_SECONDS));
      seekPreview(clampedEnd);
      return { ...prev, start: clampedStart, end: clampedEnd };
    });
  }

  // Dragging the trim window's body (rather than either edge) shifts both
  // points together, keeping the span fixed — VideoTrimTimeline already
  // clamps the candidate start to stay within [0, duration - span] before
  // calling this, so there's no additional clamping to do here.
  function setDraftWindowStart(newStart: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const span = prev.end - prev.start;
      seekPreview(newStart);
      return { ...prev, start: newStart, end: newStart + span };
    });
  }

  function beginUrlOrSearchDraft(id: string) {
    setUrlError(null);
    setUrlInput("");
    setDuration(null);
    setDraft({ videoId: id, start: 0, end: MAX_CLIP_SECONDS });
  }

  function handleVideoPicked(result: YoutubeVideoSearchResult) {
    setSearching(false);
    beginUrlOrSearchDraft(result.videoId);
  }

  function applyCurrentTimeAs(which: "start" | "end") {
    const t = playerRef.current?.getCurrentTime();
    if (t === undefined) return;
    if (which === "start") setDraftStart(t);
    else setDraftEnd(t);
  }

  function previewClip() {
    const player = playerRef.current;
    if (!player || !draft) return;
    player.seekTo(draft.start, true);
    player.playVideo();
    if (previewPollRef.current) window.clearInterval(previewPollRef.current);
    previewPollRef.current = window.setInterval(() => {
      if (draft && player.getCurrentTime() >= draft.end) {
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

      {draft ? (
        <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-3 dark:border-white/10">
          <div ref={containerRef} className="aspect-video w-full overflow-hidden rounded-lg bg-black" />

          <VideoTrimTimeline
            duration={Math.max(duration ?? MAX_CLIP_SECONDS * 10, 1)}
            start={draft.start}
            end={draft.end}
            maxClipSeconds={MAX_CLIP_SECONDS}
            onStartChange={setDraftStart}
            onEndChange={setDraftEnd}
            onWindowShift={setDraftWindowStart}
          />

          <div className="flex items-center justify-between gap-2 text-xs text-neutral-600 dark:text-white/60">
            <span>
              {formatSeconds(draft.start)} – {formatSeconds(draft.end)}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => applyCurrentTimeAs("start")}
                className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-[11px] font-medium hover:bg-neutral-100 dark:border-white/15 dark:hover:bg-white/5"
              >
                Set start to current
              </button>
              <button
                type="button"
                onClick={() => applyCurrentTimeAs("end")}
                className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-[11px] font-medium hover:bg-neutral-100 dark:border-white/15 dark:hover:bg-white/5"
              >
                Set end to current
              </button>
            </div>
          </div>

          <p className="text-xs text-neutral-400 dark:text-white/40">
            Clip length: {(draft.end - draft.start).toFixed(1)}s (max {MAX_CLIP_SECONDS}s — moving one
            handle drags the other along to stay within that span). Nothing&apos;s saved until you
            confirm below.
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
              onClick={cancelDraft}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:text-white/50 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDraft}
              className="rounded-lg bg-builder-accent px-3 py-1.5 text-xs font-semibold text-black transition-transform hover:-translate-y-0.5"
            >
              Confirm clip
            </button>
          </div>
        </div>
      ) : videoId ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 p-3 dark:border-white/10">
          <p className="text-xs text-neutral-600 dark:text-white/60">
            Using {formatSeconds(start)}–{formatSeconds(end ?? start + MAX_CLIP_SECONDS)} of{" "}
            <span className="font-mono">{videoId}</span>
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={beginEdit}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/5"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onChange(null, 0, null)}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Same colour convention as MediaUploadField (mediaActionStyles.ts):
              green for pasting a link straight in, violet for searching. */}
          <div className="flex gap-2 rounded-lg border-2 border-dashed border-emerald-500/40 bg-emerald-500/[0.04] p-2 dark:border-emerald-400/30 dark:bg-emerald-400/[0.04]">
            <input
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                setUrlError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  beginUrlSubmit();
                }
              }}
              placeholder="Paste a YouTube link"
              className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm placeholder-neutral-400 focus:border-emerald-500 focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder-white/30"
            />
            <button
              type="button"
              onClick={beginUrlSubmit}
              disabled={!urlInput.trim()}
              className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              Use link
            </button>
          </div>
          <button type="button" onClick={() => setSearching(true)} className={`self-start ${YOUTUBE_BUTTON_CLASS}`}>
            <YoutubeIcon />
            Search YouTube
          </button>
        </div>
      )}
      {urlError && <p className="text-red-600 dark:text-red-400">{urlError}</p>}
      {searching && <YoutubeSearchModal onSelect={handleVideoPicked} onClose={() => setSearching(false)} />}
    </div>
  );
}
