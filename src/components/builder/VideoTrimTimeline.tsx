"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The most-zoomed-in view shows this fraction of the full clip duration (or
// maxClipSeconds*0.6, whichever is larger, so a very long video doesn't zoom
// in so far the handle's own span no longer fits on screen).
const MIN_VIEW_SPAN_RATIO = 0.05;
// How long a continuous edge-drag takes to reach that max zoom — holding
// the handle is what zooms in, exactly like trimming a clip in iOS Photos,
// rather than the zoom being tied to how far the pointer has physically
// moved (which would make small, precise adjustments harder to reach, not
// easier).
const ZOOM_RAMP_MS = 850;

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
 * multi-minute video can still be trimmed to within a fraction of a second. */
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
    startClientX: number;
    windowStartAtGrab: number;
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

  const xToTime = useCallback(
    (x: number) => view.start + (x / Math.max(trackWidth, 1)) * (view.end - view.start),
    [view, trackWidth]
  );

  function updateZoom(centerTime: number) {
    const drag = dragRef.current;
    if (!drag) return;
    const elapsed = performance.now() - drag.grabTime;
    const t = clamp(elapsed / ZOOM_RAMP_MS, 0, 1);
    const eased = t * t * (3 - 2 * t); // smoothstep — eases into the zoom rather than snapping
    const fullSpan = Math.max(duration, 1);
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
  }

  function beginDrag(kind: DragKind, e: React.PointerEvent) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      windowStartAtGrab: start,
      windowSpan: end - start,
      grabTime: performance.now(),
    };
    setActiveHandle(kind);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || trackWidth === 0) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (drag.kind === "window") {
      // The window drag deliberately stays at the resting (unzoomed) scale
      // — it's for coarse repositioning, not fine trimming, so the ruler
      // doesn't need to narrow the way it does for an edge grab.
      const dx = e.clientX - drag.startClientX;
      const dt = (dx / trackWidth) * (view.end - view.start);
      onWindowShift(clamp(drag.windowStartAtGrab + dt, 0, Math.max(duration - drag.windowSpan, 0)));
      return;
    }

    const x = clamp(e.clientX - rect.left, 0, trackWidth);
    const t = clamp(xToTime(x), 0, duration);
    updateZoom(t);
    if (drag.kind === "start") onStartChange(t);
    else onEndChange(t);
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
  const tickCount = 9;
  const ticks = Array.from({ length: tickCount }, (_, i) => view.start + (fullSpan * i) / (tickCount - 1));

  return (
    <div className="flex flex-col gap-1.5 select-none">
      {/* The overflow-hidden ruler track and the live-readout tooltip are
          separate layers on purpose: the tooltip sits above the track (-top
          offset) and would get clipped by the track's own overflow-hidden,
          which the ticks/dimmed regions need to stay confined to rounded
          corners. Both share this same relative wrapper's width, so a
          percentage-based `left` lines up identically on either layer. */}
      <div className="relative">
        <div
          ref={trackRef}
          className="relative h-14 touch-none overflow-hidden rounded-lg bg-neutral-100 dark:bg-white/5"
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerLeave={(e) => {
            if (dragRef.current?.pointerId === e.pointerId) endDrag();
          }}
        >
        {/* Ruler ticks — density visibly increases as an edge-drag zooms the
            view in, which is what actually reads as "zooming" to the eye
            since there's no video-frame filmstrip to show instead. */}
        {ticks.map((t, i) => (
          <div
            key={i}
            className="absolute top-0 flex h-full flex-col items-center"
            style={{ left: `${(i / (tickCount - 1)) * 100}%` }}
          >
            <div className="h-2.5 w-px bg-neutral-300 dark:bg-white/15" />
            <span className="mt-auto mb-0.5 text-[9px] tabular-nums text-neutral-400 dark:text-white/30">
              {formatTime(t)}
            </span>
          </div>
        ))}

        {/* Dimmed regions outside the current selection. */}
        <div
          className="absolute inset-y-0 left-0 bg-black/40 dark:bg-black/60"
          style={{ width: `${clamp(startPct, 0, 100)}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-black/40 dark:bg-black/60"
          style={{ width: `${clamp(100 - endPct, 0, 100)}%` }}
        />

        {/* The selection window itself — dragging its body repositions
            both edges together. */}
        <div
          className="absolute inset-y-0 cursor-grab border-y-2 border-builder-accent bg-builder-accent/20 active:cursor-grabbing"
          style={{ left: `${clamp(startPct, 0, 100)}%`, width: `${clamp(endPct - startPct, 0, 100)}%` }}
          onPointerDown={(e) => beginDrag("window", e)}
        />

        {/* Edge grips — wider invisible hit area than the visible bar so
            they're easy to grab precisely on touch. */}
        <div
          className="absolute inset-y-0 flex w-6 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center"
          style={{ left: `${clamp(startPct, 0, 100)}%` }}
          onPointerDown={(e) => beginDrag("start", e)}
        >
          <div className="h-full w-1.5 rounded-full bg-builder-accent shadow-sm" />
        </div>
        <div
          className="absolute inset-y-0 flex w-6 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center"
          style={{ left: `${clamp(endPct, 0, 100)}%` }}
          onPointerDown={(e) => beginDrag("end", e)}
        >
          <div className="h-full w-1.5 rounded-full bg-builder-accent shadow-sm" />
        </div>
        </div>

        {/* Live precise readout above whichever edge is actively being
            dragged — rendered outside the track above so its -top offset
            doesn't get clipped by the track's own overflow-hidden. The
            ruler's own tick labels only show a handful of ticks, not the
            exact grabbed value. */}
        {activeHandle && activeHandle !== "window" && (
          <div
            className="pointer-events-none absolute -top-6 -translate-x-1/2 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white shadow dark:bg-black"
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
