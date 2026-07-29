"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// A grace period before any zoom starts — ordinary dragging (the whole
// reason to grab a handle in the first place) should never zoom the ruler
// out from under it. Only a genuine, sustained hold — several seconds,
// clearly deliberate rather than incidental to dragging — zooms in.
const ZOOM_START_DELAY_MS = 5000;
// How long the ramp takes once it starts.
const ZOOM_RAMP_MS = 700;
// The most-zoomed-in view shows this fraction of the full clip duration (or
// maxClipSeconds*0.6, whichever is larger, so a very long video doesn't zoom
// in so far the handle's own span no longer fits on screen).
const MIN_VIEW_SPAN_RATIO = 0.05;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.max(0, s % 60);
  return `${m}:${sec.toFixed(2).padStart(5, "0")}`;
}

type DragKind = "start" | "end" | "window";

/** An iOS Photos-style trim strip: a ruler for the whole clip, with the
 * current start/end selection drawn as a highlighted window. Dragging the
 * window itself shifts both points together (same span); dragging either
 * edge adjusts just that point — and holding an edge while dragging
 * progressively zooms the ruler in around it, trading how much of the clip
 * is visible for how finely a single pixel of drag maps to time, so a
 * multi-minute video can still be trimmed to within a fraction of a second.
 *
 * Every frame's movement is applied as an incremental delta (this frame's
 * pixel movement × the *current* pixels-per-second, converted to a time
 * delta added onto a running value) rather than re-deriving an absolute time
 * from the cursor's raw screen position against whatever the view happens to
 * be that frame. The latter is what made this glitchy: as the view narrows
 * while zooming, the same physical pixel position under the cursor maps to
 * a different time than it did a frame ago even with the pointer
 * perfectly still, so the dragged value would jump around on its own as
 * zoom ramped in. Incremental deltas don't have that feedback loop — a
 * stationary pointer always contributes zero change, regardless of how the
 * view is currently scaled. */
export function VideoTrimTimeline({
  duration,
  start,
  end,
  maxClipSeconds,
  onStartChange,
  onEndChange,
  onWindowShift,
}: {
  duration: number;
  start: number;
  end: number;
  maxClipSeconds: number;
  onStartChange: (t: number) => void;
  onEndChange: (t: number) => void;
  onWindowShift: (newStart: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [view, setView] = useState({ start: 0, end: Math.max(duration, 1) });
  const [activeHandle, setActiveHandle] = useState<DragKind | null>(null);
  const dragRef = useRef<{
    kind: DragKind;
    pointerId: number;
    lastClientX: number;
    liveValue: number; // running start/end (or window start) as it's dragged
    windowSpan: number;
    grabTime: number;
  } | null>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setTrackWidth(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The full-duration view is the resting state — only an active edge-drag
  // (see updateZoom) narrows it. Duration itself starts as a placeholder
  // estimate and gets replaced once the player actually reports its length.
  useEffect(() => {
    if (!dragRef.current) setView({ start: 0, end: Math.max(duration, 1) });
  }, [duration]);

  const updateZoom = useCallback(
    (centerTime: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      const elapsed = performance.now() - drag.grabTime;
      const rampElapsed = Math.max(0, elapsed - ZOOM_START_DELAY_MS);
      const t = clamp(rampElapsed / ZOOM_RAMP_MS, 0, 1);
      const fullSpan = Math.max(duration, 1);

      if (t <= 0) {
        setView((prev) => (prev.start === 0 && prev.end === fullSpan ? prev : { start: 0, end: fullSpan }));
        return;
      }

      const eased = t * t * (3 - 2 * t); // smoothstep — eases into the zoom rather than snapping
      const minSpan = Math.max(fullSpan * MIN_VIEW_SPAN_RATIO, maxClipSeconds * 0.6);
      const span = fullSpan - (fullSpan - minSpan) * eased;

      let newStart = centerTime - span / 2;
      let newEnd = centerTime + span / 2;
      if (newStart < 0) {
        newEnd -= newStart;
        newStart = 0;
      }
      if (newEnd > fullSpan) {
        newStart -= newEnd - fullSpan;
        newEnd = fullSpan;
      }
      setView({ start: clamp(newStart, 0, fullSpan), end: clamp(newEnd, 0, fullSpan) });
    },
    [duration, maxClipSeconds]
  );

  function beginDrag(kind: DragKind, e: React.PointerEvent) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind,
      pointerId: e.pointerId,
      lastClientX: e.clientX,
      liveValue: kind === "end" ? end : start,
      windowSpan: end - start,
      grabTime: performance.now(),
    };
    setActiveHandle(kind);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || trackWidth === 0) return;

    const pxPerSecond = trackWidth / Math.max(view.end - view.start, 0.001);
    const dt = (e.clientX - drag.lastClientX) / pxPerSecond;
    drag.lastClientX = e.clientX;

    if (drag.kind === "window") {
      // The window drag deliberately never zooms — it's for coarse
      // repositioning at a glance, not fine trimming.
      const newStart = clamp(drag.liveValue + dt, 0, Math.max(duration - drag.windowSpan, 0));
      drag.liveValue = newStart;
      onWindowShift(newStart);
      return;
    }

    const newValue = clamp(drag.liveValue + dt, 0, duration);
    drag.liveValue = newValue;
    updateZoom(newValue);
    if (drag.kind === "start") onStartChange(newValue);
    else onEndChange(newValue);
  }

  function endDrag() {
    dragRef.current = null;
    setActiveHandle(null);
    setView({ start: 0, end: Math.max(duration, 1) });
  }

  const fullSpan = Math.max(view.end - view.start, 0.001);
  const toPct = (t: number) => clamp(((t - view.start) / fullSpan) * 100, -5, 105);
  const startPct = toPct(start);
  const endPct = toPct(end);
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount }, (_, i) => view.start + (fullSpan * i) / (tickCount - 1));

  return (
    <div className="flex flex-col gap-1.5 select-none">
      {/* The overflow-hidden ruler track and the live-readout tooltip are
          separate layers on purpose: the tooltip sits above the track (-top
          offset) and would get clipped by the track's own overflow-hidden,
          which the ticks/dimmed regions need to stay confined to rounded
          corners. Both share this same relative wrapper's width, so a
          percentage-based `left` lines up identically on either layer. */}
      <div className="relative pt-6">
        <div
          ref={trackRef}
          className="relative h-12 touch-none overflow-hidden rounded-xl bg-neutral-200/70 shadow-inner dark:bg-black/40"
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerLeave={(e) => {
            if (dragRef.current?.pointerId === e.pointerId) endDrag();
          }}
        >
          {/* Ruler ticks — density visibly increases as an edge-drag zooms
              the view in, which is what actually reads as "zooming" to the
              eye since there's no video-frame filmstrip to show instead. */}
          {ticks.map((t, i) => (
            <div
              key={i}
              className="absolute inset-y-0 flex flex-col items-center justify-end pb-1"
              style={{ left: `${(i / (tickCount - 1)) * 100}%` }}
            >
              <div className="h-2 w-px bg-neutral-400/60 dark:bg-white/20" />
              {(i === 0 || i === tickCount - 1 || i === Math.floor((tickCount - 1) / 2)) && (
                <span className="absolute bottom-1 translate-y-full pt-1 text-[9px] tabular-nums text-neutral-400 dark:text-white/30">
                  {formatTime(t)}
                </span>
              )}
            </div>
          ))}

          {/* Dimmed regions outside the current selection. */}
          <div
            className="absolute inset-y-0 left-0 bg-black/45"
            style={{ width: `${clamp(startPct, 0, 100)}%` }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-black/45"
            style={{ width: `${clamp(100 - endPct, 0, 100)}%` }}
          />

          {/* The selection window itself — dragging its body repositions
              both edges together. */}
          <div
            className="absolute inset-y-0 cursor-grab rounded-md border-2 border-builder-accent bg-builder-accent/15 shadow-[0_0_0_1px_rgba(0,0,0,0.15)] active:cursor-grabbing"
            style={{ left: `${clamp(startPct, 0, 100)}%`, width: `${clamp(endPct - startPct, 0, 100)}%` }}
            onPointerDown={(e) => beginDrag("window", e)}
          />

          {/* Edge grips — wider invisible hit area than the visible bar so
              they're easy to grab precisely on touch. */}
          {(["start", "end"] as const).map((kind) => (
            <div
              key={kind}
              className="absolute inset-y-0 z-10 flex w-7 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center"
              style={{ left: `${clamp(kind === "start" ? startPct : endPct, 0, 100)}%` }}
              onPointerDown={(e) => beginDrag(kind, e)}
            >
              <div
                className={`flex h-full w-3 flex-col items-center justify-center gap-0.5 rounded-full bg-builder-accent shadow-md transition-transform ${
                  activeHandle === kind ? "scale-110" : ""
                }`}
              >
                <span className="h-2.5 w-[1.5px] rounded-full bg-black/40" />
                <span className="h-2.5 w-[1.5px] rounded-full bg-black/40" />
              </div>
            </div>
          ))}
        </div>

        {/* Live precise readout above whichever edge is actively being
            dragged — rendered outside the track above so its -top offset
            doesn't get clipped by the track's own overflow-hidden. The
            ruler's own tick labels only show a handful of ticks, not the
            exact grabbed value. */}
        {activeHandle && activeHandle !== "window" && (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white shadow dark:bg-black"
            style={{ left: `${clamp(activeHandle === "start" ? startPct : endPct, 0, 100)}%` }}
          >
            {formatTime(activeHandle === "start" ? start : end)}
          </div>
        )}
      </div>
      <p className="text-center text-[11px] text-neutral-400 dark:text-white/40">
        Drag the highlighted window to move it, or drag either edge to trim — hold an edge to zoom
        in for precision.
      </p>
    </div>
  );
}
