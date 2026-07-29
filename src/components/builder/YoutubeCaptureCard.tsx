"use client";

import { useEffect, useRef, useState } from "react";
import { loadYoutubeIframeApi, type YTPlayer } from "@/lib/youtubeIframeApi";

// Region Capture — CropTarget.fromElement() + track.cropTo() — isn't in
// TS's DOM lib yet. It's a real, shipped Chromium API (Chrome/Edge 104+),
// not a proposal: it's what lets a getDisplayMedia() capture be narrowed
// down to just one element's pixels instead of the whole tab.
declare global {
  interface Window {
    CropTarget?: { fromElement(element: Element): Promise<unknown> };
  }
  interface MediaStreamTrack {
    cropTo?(target: unknown): Promise<void>;
  }
}

type CaptureOptions = DisplayMediaStreamOptions & { preferCurrentTab?: boolean };

/** Region Capture is the hard prerequisite here, not getDisplayMedia alone
 * — without it there'd be no way to isolate the player from the rest of the
 * page, and recording (and backgrounding) the entire builder UI obviously
 * isn't the goal. Both are Chromium-only today, so this whole feature is a
 * progressive enhancement: unsupported browsers fall back to whatever
 * server-side path the caller already had. */
export function supportsTabCapture(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getDisplayMedia &&
    "CropTarget" in window &&
    typeof MediaRecorder !== "undefined"
  );
}

// How long before the clip's real start point to begin (silently, off-
// camera) playback — long enough for YouTube's own play/pause button and
// buffering chrome (which show right as playback kicks in) to have settled
// before anything is actually recorded. Trimming a beat off the end avoids
// a trailing black frame some clips otherwise end on.
const WARMUP_SECONDS = 3;
const END_TRIM_SECONDS = 0.5;

function pickMimeType(): string {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return "video/webm";
}

type Stage = "confirm" | "recording";

/** Records a YouTube clip by having the browser share its own current tab
 * back to itself, cropped down (via Region Capture) to just a small
 * floating player, and piped into MediaRecorder — entirely on the person's
 * own browser and real IP, with them actually present for the one-time
 * share prompt. That sidesteps YouTube's bot detection rather than trying
 * to out-clever it: every server-side path tried before this (ytdl-core,
 * yt-dlp, a headless browser with a valid signed-in cookie, a dozen Piped/
 * Invidious mirrors, a Cobalt instance) hit either an IP-reputation block or
 * a deliberate Turnstile/JWT gate not worth bypassing.
 *
 * The player fills nearly the entire tab while recording rather than
 * sitting in a small corner — cropped capture resolution is tied to the
 * element's actual on-screen physical-pixel size (capture ≈ CSS size ×
 * devicePixelRatio), and these clips often end up projected full-screen on
 * a TV, so it's worth the tradeoff of blocking the rest of the page for the
 * clip's duration in exchange for capturing at close to the browser
 * window's native resolution instead of a thumbnail's worth of pixels. */
export function YoutubeCaptureCard({
  videoId,
  start,
  end,
  onDone,
  onCancel,
}: {
  videoId: string;
  start: number;
  end: number;
  onDone: (blob: Blob) => void;
  onCancel: (message?: string) => void;
}) {
  const [stage, setStage] = useState<Stage>("confirm");
  const [dialogClosing, setDialogClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priming, setPriming] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(WARMUP_SECONDS);
  // Captions are an account/browser-level YouTube preference — cc_load_policy
  // and unloadModule('captions') help, but neither is 100% guaranteed to
  // override it, so this is asked of the person directly rather than only
  // relied on programmatically. Gates the confirm button rather than just
  // being advisory text, since it's easy to skim past a paragraph.
  const [checklist, setChecklist] = useState({ captionsOff: false, fullscreened: false, staysOnTab: false });
  const allChecked = checklist.captionsOff && checklist.fullscreened && checklist.staysOnTab;

  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const countdownIdRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  const hasBegunRef = useRef(false);

  function cleanupStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    playerRef.current?.destroy();
    playerRef.current = null;
    if (countdownIdRef.current) window.clearInterval(countdownIdRef.current);
  }

  useEffect(() => cleanupStream, []);

  function finishWith(action: () => void) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    cleanupStream();
    action();
  }

  function cancelFromDialog() {
    setDialogClosing(true);
    window.setTimeout(() => onCancel(), 180);
  }

  async function handleConfirm() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
        preferCurrentTab: true,
      } as CaptureOptions);
    } catch (err) {
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "AbortError")) {
        onCancel();
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't get permission to record this tab.");
      return;
    }

    streamRef.current = stream;
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      finishWith(() => onCancel("Screen sharing stopped before the clip finished recording."));
    });
    setStage("recording");
  }

  // Mounts the (hidden-chrome) YouTube player once a stream exists, crops
  // the stream to just that player via Region Capture, then records for
  // exactly the clip's duration. Same imperative-mount pattern as the
  // trim-preview player in BackgroundMediaField.
  useEffect(() => {
    if (stage !== "recording") return;
    const stream = streamRef.current;
    const mountEl = mountRef.current;
    if (!stream || !mountEl) return;
    let cancelled = false;

    const playerHost = document.createElement("div");
    playerHost.className = "h-full w-full";
    mountEl.appendChild(playerHost);

    loadYoutubeIframeApi().then((YT) => {
      if (cancelled) return;
      playerRef.current = new YT.Player(playerHost, {
        videoId,
        playerVars: {
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          cc_load_policy: 0,
        },
        events: {
          onReady: async (e) => {
            if (cancelled) return;
            const player = e.target;
            const warmStart = Math.max(0, start - WARMUP_SECONDS);
            player.mute();
            player.seekTo(warmStart, true);
            player.playVideo();
            // cc_load_policy: 0 alone doesn't reliably override a signed-in
            // viewer's own "always show captions" account preference —
            // this is the actual forceful off-switch.
            player.unloadModule?.("captions");

            try {
              const track = stream.getVideoTracks()[0];
              const cropTarget = await window.CropTarget?.fromElement(mountEl);
              if (cropTarget) await track.cropTo?.(cropTarget);
            } catch (err) {
              if (cancelled) return;
              finishWith(() =>
                onCancel(err instanceof Error ? `Couldn't isolate the clip from the rest of the tab — ${err.message}` : "Couldn't isolate the clip from the rest of the tab.")
              );
            }
          },
          onStateChange: (e) => {
            // Only the first real transition into PLAYING matters — that's
            // the moment actual video frames start flowing (past whatever
            // paused-thumbnail/play-button state preceded it), and the only
            // reliable clock to measure the warmup wait from, since
            // buffering delay before that point is unpredictable.
            if (cancelled || hasBegunRef.current || e.data !== YT.PlayerState.PLAYING) return;
            hasBegunRef.current = true;

            // Always the full warmup, regardless of how much lead-in room
            // start actually had — when start is small (0-2s), waiting only
            // start - warmStart left near-zero real time between the
            // PLAYING transition and recording, which wasn't enough for
            // YouTube's own play-button/watermark fade-out animation to
            // finish (that CSS transition lags a beat behind the JS state
            // change). A full 3s buffer covers it consistently either way.
            const waitMs = WARMUP_SECONDS * 1000;
            setSecondsLeft(Math.ceil(waitMs / 1000));
            const primingStartedAt = performance.now();
            countdownIdRef.current = window.setInterval(() => {
              setSecondsLeft(Math.max(0, Math.ceil((waitMs - (performance.now() - primingStartedAt)) / 1000)));
            }, 250);

            window.setTimeout(() => {
              if (countdownIdRef.current) window.clearInterval(countdownIdRef.current);
              if (cancelled) return;
              setPriming(false);
              // A couple of paint cycles between "warmup elapsed" and
              // actually starting the recorder, so MediaRecorder locks onto
              // a frame the compositor has already fully settled on rather
              // than whatever was mid-transition the instant the timer fired.
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  if (cancelled) return;
                  startRecording(stream);
                });
              });
            }, waitMs);
          },
        },
      });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only (re)run when recording actually starts
  }, [stage]);

  function startRecording(stream: MediaStream) {
    const durationMs = Math.max(100, (end - start - END_TRIM_SECONDS) * 1000);
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      finishWith(() => onDone(new Blob(chunks, { type: recorder.mimeType })));
    };

    recorder.start();
    setSecondsLeft(Math.ceil(durationMs / 1000));
    const startedAt = performance.now();
    countdownIdRef.current = window.setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((durationMs - (performance.now() - startedAt)) / 1000)));
    }, 250);

    window.setTimeout(() => {
      if (countdownIdRef.current) window.clearInterval(countdownIdRef.current);
      if (recorder.state === "recording") recorder.stop();
    }, durationMs);
  }

  if (stage === "confirm") {
    return (
      <div
        className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        onClick={cancelFromDialog}
      >
        <div
          className={`w-full max-w-md rounded-xl border border-neutral-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-neutral-900 ${
            dialogClosing ? "animate-modal-out" : "animate-modal-in"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">Record this clip?</p>
          <p className="mt-2 text-xs leading-relaxed text-neutral-500 dark:text-white/50">
            Your browser will ask you to share this tab — that&apos;s how the clip gets recorded, since YouTube
            blocks automated downloads. Once you allow it, the clip takes over the screen at full size for{" "}
            {Math.round(end - start)}s.
          </p>

          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 dark:border-white/10">
            <p className="text-xs font-semibold text-neutral-700 dark:text-white/70">Before you continue:</p>
            <label className="flex items-start gap-2 text-xs text-neutral-600 dark:text-white/60">
              <input
                type="checkbox"
                checked={checklist.captionsOff}
                onChange={(e) => setChecklist((c) => ({ ...c, captionsOff: e.target.checked }))}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-builder-accent"
              />
              <span>
                Captions/subtitles are off on YouTube (the CC icon on any video) — this is a
                per-account setting we can&apos;t always force off, and it can flash in the recording
                otherwise.
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-neutral-600 dark:text-white/60">
              <input
                type="checkbox"
                checked={checklist.fullscreened}
                onChange={(e) => setChecklist((c) => ({ ...c, fullscreened: e.target.checked }))}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-builder-accent"
              />
              <span>This browser window is full-screened or maximized, for the sharpest capture.</span>
            </label>
            <label className="flex items-start gap-2 text-xs text-neutral-600 dark:text-white/60">
              <input
                type="checkbox"
                checked={checklist.staysOnTab}
                onChange={(e) => setChecklist((c) => ({ ...c, staysOnTab: e.target.checked }))}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-builder-accent"
              />
              <span>I&apos;ll stay on this tab — not switch away or close it — until it finishes.</span>
            </label>
          </div>

          {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelFromDialog}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:text-white/50 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!allChecked}
              onClick={() => void handleConfirm()}
              className="rounded-lg bg-builder-accent px-3 py-1.5 text-xs font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
            >
              Share &amp; record
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-modal-in fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm sm:p-10">
      <div className="flex w-full max-w-[1800px] flex-col gap-4">
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-[0_0_140px_10px_rgba(255,201,49,0.3)]">
          <div ref={mountRef} className="h-full w-full" />
          {/* Eats every pointer event so hovering/clicking anywhere on the
              page can never reach the iframe and nudge playback mid-capture. */}
          <div className="absolute inset-0" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-medium text-white/80">
            <span className={`h-2 w-2 rounded-full ${priming ? "bg-white/40" : "animate-pulse bg-red-500"}`} />
            {priming
              ? `Starting in ${secondsLeft}s…`
              : `Recording… ${secondsLeft}s left — don't switch tabs or close this window`}
          </span>
          <button
            type="button"
            onClick={() => finishWith(() => onCancel())}
            className="text-sm font-medium text-white/40 hover:text-white/80"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
