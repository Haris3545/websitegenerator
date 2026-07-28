"use client";

import { useEffect, useId, useRef } from "react";
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
  const mountId = useId().replace(/[:]/g, "");
  const playerRef = useRef<YTPlayer | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadYoutubeIframeApi().then((YT) => {
      if (cancelled) return;
      const el = document.getElementById(mountId);
      if (!el) return;

      playerRef.current = new YT.Player(el, {
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-creating the player on every start/end tick would restart playback constantly
  }, [videoId, mountId]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ filter }}>
      <div
        id={mountId}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: `${177.78 * OVERSCAN}vh`,
          height: `${100 * OVERSCAN}vh`,
          minWidth: `${100 * OVERSCAN}%`,
          minHeight: `${56.25 * OVERSCAN}vw`,
          transform: `translate(-50%, -${VERTICAL_BIAS * 100}%) scale(${zoom})`,
        }}
      />
    </div>
  );
}
