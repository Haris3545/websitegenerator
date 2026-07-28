"use client";

import { useEffect, useRef } from "react";
import { loadYoutubeIframeApi, type YTPlayer } from "@/lib/youtubeIframeApi";

// How far ahead of the clip's own end point to seek back to start — the
// point is to seek away *before* playback ever reaches the boundary
// YouTube's own player would treat as "the end", since reaching that
// natively triggers the ended-state replay-icon overlay, which no embed
// parameter can suppress. Proactively seeking mid-playback instead is just
// an ordinary seek during PLAYING state, which doesn't show that overlay.
const LOOP_LEAD_SECONDS = 0.35;
const POLL_MS = 150;

// Extra size beyond the ordinary 16:9-cover sizing, biased upward, so
// YouTube's own title-card overlay (which renders near the top of the
// frame for the first couple of seconds, and there's no official parameter
// to suppress it) gets pushed above the visible, clipped window instead of
// sitting inside it. There's no documented, guaranteed way to fully
// eliminate YouTube's native UI chrome from a standard embed — this is a
// best-effort visual crop, the same technique used across the web for
// "YouTube as an ambient background," not an official suppression.
const OVERSCAN = 1.22;
const VERTICAL_BIAS = 0.58; // 0.5 would be dead-center; higher shifts the crop window down (hiding more of the top)

export function YoutubeBackgroundPlayer({
  videoId,
  start,
  end,
  zoom = 1,
  filter,
}: {
  videoId: string;
  start: number;
  end: number;
  zoom?: number;
  filter?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountElRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    // Built by hand (not as a JSX element) and handed to YT.Player, which
    // the YouTube IFrame API then replaces in place with a live <iframe> —
    // a DOM mutation React never finds out about. Giving it a node React
    // itself never rendered means React's reconciler never tries to
    // remove *this specific* node later (on unmount, or in dev when
    // StrictMode double-invokes this effect); it only ever removes the
    // stable `container` div below, which was never swapped for anything
    // and always safely contains whatever's currently there. Without this,
    // the swap left React holding a stale reference to a node no longer in
    // the document, and its next attempt to remove it threw an uncaught
    // "Failed to execute 'removeChild'" DOM exception that crashed the
    // whole page.
    const mountEl = document.createElement("div");
    Object.assign(mountEl.style, {
      position: "absolute",
      top: "50%",
      left: "50%",
      width: `${177.78 * OVERSCAN}vh`,
      height: `${100 * OVERSCAN}vh`,
      minWidth: `${100 * OVERSCAN}%`,
      minHeight: `${56.25 * OVERSCAN}vw`,
      transform: `translate(-50%, -${VERTICAL_BIAS * 100}%) scale(${zoom})`,
    });
    mountElRef.current = mountEl;
    container.appendChild(mountEl);

    loadYoutubeIframeApi().then((YT) => {
      if (cancelled) return;

      playerRef.current = new YT.Player(mountEl, {
        videoId,
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
          start: Math.floor(start),
          // Deliberately no `end` here — letting YouTube's own player
          // enforce the cutoff means it hard-stops into the ended state
          // (and its accompanying replay-icon overlay) right at the
          // boundary. The poll below seeks away just before that ever
          // happens, so the loop is driven entirely by us instead.
        },
        events: {
          onReady: (e) => {
            e.target.mute();
            e.target.playVideo();
            pollRef.current = window.setInterval(() => {
              if (playerRef.current && playerRef.current.getCurrentTime() >= end - LOOP_LEAD_SECONDS) {
                playerRef.current.seekTo(start, true);
              }
            }, POLL_MS);
          },
          onStateChange: (e) => {
            // A fallback only — the poll above should always seek away
            // before this can naturally fire, but if it's ever missed for
            // any reason, still recover into the loop rather than sitting
            // on YouTube's own "video ended" card indefinitely.
            if (e.data === YT.PlayerState.ENDED) {
              e.target.seekTo(start, true);
              e.target.playVideo();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
      playerRef.current?.destroy();
      playerRef.current = null;
      mountElRef.current = null;
      // Whatever's actually in there right now — our still-plain mountEl if
      // the API hadn't resolved yet, or the iframe it was swapped for —
      // gets removed as a direct DOM operation instead of asking React's
      // reconciler to diff/remove a node it may no longer recognize.
      container.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-creating the player on every start/end/zoom tick would restart playback constantly; those are read once at mount, zoom is re-applied without a remount below
  }, [videoId]);

  // Zoom can change live (the aesthetic panel's background-zoom slider)
  // without needing to tear down and recreate the player. Re-applying the
  // transform directly to whatever's currently mounted — the plain div
  // before the API resolves, the live iframe after — keeps that working
  // even though the element YT actually renders isn't the one React holds
  // a reference to.
  useEffect(() => {
    const el = mountElRef.current;
    if (!el) return;
    el.style.transform = `translate(-50%, -${VERTICAL_BIAS * 100}%) scale(${zoom})`;
  }, [zoom]);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ filter }}
    />
  );
}
