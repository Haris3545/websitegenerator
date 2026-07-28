"use client";

import { useEffect, useId, useRef } from "react";
import { loadYoutubeIframeApi, type YTPlayer } from "@/lib/youtubeIframeApi";

/** Plays a short, looping window of a YouTube video as a full-bleed
 * background — via YouTube's own official embed player, never by
 * downloading/re-encoding the video (which YouTube's Terms of Service
 * prohibit). Loops by reacting to the ENDED state (playerVars.end stops
 * playback there) and a small time-poll as a backstop, since relying on
 * the `end` param alone has occasionally been unreliable across embed API
 * versions in the wild. Cross-origin iframes still fully accept ordinary
 * CSS filter effects from the parent page (that's a rendering operation,
 * not a script-access one), so blur/contrast/saturate keep working the
 * same as they do on the uploaded-video background path — only per-axis
 * pan doesn't translate here, since object-position has no iframe
 * equivalent; this only supports centered zoom. */
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
          end: Math.ceil(end),
        },
        events: {
          onReady: (e) => {
            e.target.mute();
            e.target.playVideo();
            pollRef.current = window.setInterval(() => {
              if (playerRef.current && playerRef.current.getCurrentTime() >= end) {
                playerRef.current.seekTo(start, true);
              }
            }, 250);
          },
          onStateChange: (e) => {
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
          width: "177.78vh",
          height: "100vh",
          minWidth: "100%",
          minHeight: "56.25vw",
          transform: `translate(-50%, -50%) scale(${zoom})`,
        }}
      />
    </div>
  );
}
