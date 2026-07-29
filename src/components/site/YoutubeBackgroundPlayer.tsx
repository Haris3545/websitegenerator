"use client";

import { useEffect, useRef, useState } from "react";
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

function mountTransform(zoom: number) {
  return `translate(-50%, -${VERTICAL_BIAS * 100}%) scale(${zoom})`;
}

type Role = "a" | "b";

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
  const containerARef = useRef<HTMLDivElement>(null);
  const containerBRef = useRef<HTMLDivElement>(null);
  const mountARef = useRef<HTMLDivElement | null>(null);
  const mountBRef = useRef<HTMLDivElement | null>(null);
  const playerARef = useRef<YTPlayer | null>(null);
  const playerBRef = useRef<YTPlayer | null>(null);
  const pollARef = useRef<number | null>(null);
  const pollBRef = useRef<number | null>(null);
  // Which player is currently the visible one. Read via a ref inside the
  // poll callbacks (which close over it once, at player-creation time) so
  // they always see the latest value rather than whatever "active" was on
  // the render that created them.
  const [active, setActive] = useState<Role>("a");
  const activeRef = useRef<Role>("a");
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const containerA = containerARef.current;
    const containerB = containerBRef.current;
    if (!containerA || !containerB) return;
    let cancelled = false;

    // Two independent players, both always running, only one ever visible
    // (via opacity) — the actual fix for the captions/pause-icon flash a
    // single looping player kept showing at its seek-back point. However
    // fast the seek + forced playVideo() fires, YouTube's own chrome still
    // renders a frame or two of its paused/buffering UI around that
    // instant; that's invisible as long as it's happening on the *hidden*
    // player. Player B is started half a clip-length in, so the two are
    // never near their own loop-boundary at the same moment — whichever
    // one is about to glitch is always the one currently in the background,
    // and swapping which is visible is a plain opacity toggle with no seek
    // involved at all.
    const cycleLength = Math.max(end - start, 1);
    const halfOffset = Math.min(Math.max(cycleLength / 2, 1), Math.max(cycleLength - 1, 0.5));

    // Built by hand (not as JSX) and handed to YT.Player, which replaces it
    // in place with a live <iframe> — a DOM mutation React never finds out
    // about. Giving it nodes React itself never rendered means React's
    // reconciler never tries to remove *these specific* nodes later; it
    // only ever removes the stable containerA/containerB divs, which are
    // never themselves swapped for anything.
    const mountA = document.createElement("div");
    Object.assign(mountA.style, {
      position: "absolute",
      top: "50%",
      left: "50%",
      width: `${177.78 * OVERSCAN}vh`,
      height: `${100 * OVERSCAN}vh`,
      minWidth: `${100 * OVERSCAN}%`,
      minHeight: `${56.25 * OVERSCAN}vw`,
      transform: mountTransform(zoom),
    });
    mountARef.current = mountA;
    containerA.appendChild(mountA);

    const mountB = document.createElement("div");
    Object.assign(mountB.style, {
      position: "absolute",
      top: "50%",
      left: "50%",
      width: `${177.78 * OVERSCAN}vh`,
      height: `${100 * OVERSCAN}vh`,
      minWidth: `${100 * OVERSCAN}%`,
      minHeight: `${56.25 * OVERSCAN}vw`,
      transform: mountTransform(zoom),
    });
    mountBRef.current = mountB;
    containerB.appendChild(mountB);

    function setupPlayer(
      mountEl: HTMLDivElement,
      playerRef: React.MutableRefObject<YTPlayer | null>,
      pollRef: React.MutableRefObject<number | null>,
      role: Role,
      startAt: number
    ) {
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
            cc_load_policy: 0,
            start: Math.floor(startAt),
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
                const player = playerRef.current;
                if (!player) return;
                if (player.getCurrentTime() >= end - LOOP_LEAD_SECONDS) {
                  // Hand off to the other player *before* resetting this one
                  // — the swap is a plain opacity toggle, so nothing visible
                  // ever shows this seek happening.
                  if (activeRef.current === role) setActive(role === "a" ? "b" : "a");
                  player.seekTo(startAt, true);
                  player.playVideo();
                }
              }, POLL_MS);
            },
            onStateChange: (e) => {
              // Anything other than actively playing during an ambient,
              // muted, no-controls background loop is a visual glitch, not
              // a real pause a viewer asked for (there's no way to click
              // pause — the whole layer is pointer-events: none) — force
              // playback to resume immediately whenever a player drifts
              // into PAUSED or ENDED.
              if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) {
                if (e.data === YT.PlayerState.ENDED) e.target.seekTo(startAt, true);
                e.target.playVideo();
              }
            },
          },
        });
      });
    }

    setupPlayer(mountA, playerARef, pollARef, "a", start);
    setupPlayer(mountB, playerBRef, pollBRef, "b", start + halfOffset);

    return () => {
      cancelled = true;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- these hold interval IDs, not DOM nodes; nothing else ever reassigns them between here and cleanup running
      if (pollARef.current) window.clearInterval(pollARef.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (pollBRef.current) window.clearInterval(pollBRef.current);
      playerARef.current?.destroy();
      playerBRef.current?.destroy();
      playerARef.current = null;
      playerBRef.current = null;
      mountARef.current = null;
      mountBRef.current = null;
      // Whatever's actually in there right now — a still-plain mount div if
      // the API hadn't resolved yet, or the iframe it was swapped for —
      // gets removed as a direct DOM operation instead of asking React's
      // reconciler to diff/remove a node it may no longer recognize.
      containerA.replaceChildren();
      containerB.replaceChildren();
      setActive("a");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-creating the players on every start/end/zoom tick would restart playback constantly; those are read once at mount, zoom is re-applied without a remount below
  }, [videoId]);

  // Zoom can change live (the aesthetic panel's background-zoom slider)
  // without needing to tear down and recreate either player. Re-applying
  // the transform directly to whatever's currently mounted — the plain div
  // before the API resolves, the live iframe after — keeps that working
  // even though the element YT actually renders isn't the one React holds
  // a reference to.
  useEffect(() => {
    if (mountARef.current) mountARef.current.style.transform = mountTransform(zoom);
    if (mountBRef.current) mountBRef.current.style.transform = mountTransform(zoom);
  }, [zoom]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ filter }}>
      <div
        ref={containerARef}
        className="absolute inset-0 transition-opacity duration-200"
        style={{ opacity: active === "a" ? 1 : 0 }}
      />
      <div
        ref={containerBRef}
        className="absolute inset-0 transition-opacity duration-200"
        style={{ opacity: active === "b" ? 1 : 0 }}
      />
    </div>
  );
}
