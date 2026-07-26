"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { hierarchy, pack, type HierarchyCircularNode } from "d3-hierarchy";
import type { SocialComment, SocialCommentCategory } from "@/lib/database.types";

const VIEW_SIZE = 1000;
const MIN_K = 0.8;
const MAX_K = 60;
const MIN_LABEL_RADIUS = 26; // on-screen px a bubble needs before its label is worth showing
const ZOOM_TRANSITION = "transform 550ms cubic-bezier(0.22, 1, 0.36, 1)";

type PackNode = {
  name: string;
  kind: "root" | "category" | "subcategory" | "comment";
  comment?: SocialComment;
  children?: PackNode[];
  value?: number;
};

type Node = HierarchyCircularNode<PackNode>;

// A fixed palette keyed to commentCategorizer.ts's taxonomy names, so a
// category reads as the same color across every artist's map rather than
// shifting with whatever order categories happened to matter this time.
const CATEGORY_COLORS: Record<string, string> = {
  "Visuals & aesthetic": "#c084fc",
  "Sound & production": "#60a5fa",
  "Future releases": "#34d399",
  Reactions: "#fb923c",
  "Nostalgia & comparisons": "#f472b6",
  "Live & touring": "#facc15",
};
const FALLBACK_COLOR = "#a78bfa";

function colorFor(categoryName: string): string {
  return CATEGORY_COLORS[categoryName] ?? FALLBACK_COLOR;
}

function slug(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function ancestorCategoryName(node: Node): string {
  let n: Node | null = node;
  while (n && n.depth > 1) n = n.parent;
  return n?.data.name ?? "";
}

// How visible each depth is at a given zoom level k — the "only see the
// breakdown once you zoom in" behavior: everything starts folded into one
// soft "Commentary" blob (depth 0), which fades out as categories fade in,
// then subcategories, then individual comment bubbles last. Categories keep
// a small opacity floor even at the default view (rather than 0) so
// they're still visible enough to click directly — clicking one zooms in —
// without needing to scroll first.
function stageOpacity(depth: number, k: number): number {
  if (depth === 0) return clamp(1 - (k - 1) / 1.2, 0, 1);
  if (depth === 1) return clamp(0.28 + (k - 1) / 1.4, 0.28, 1);
  if (depth === 2) return clamp((k - 2.2) / 3, 0, 1);
  return clamp((k - 6) / 6, 0, 1);
}

// Pulls every node inward toward its parent's already-placed center by a
// depth-dependent factor, deliberately breaking d3.pack's default
// non-overlapping guarantee — the point is bubbles that overlap and blend
// like light sources within their cluster, not tidy non-touching circles.
function compressToward(node: Node) {
  if (!node.children) return;
  for (const child of node.children) {
    const factor = child.depth === 1 ? 0.74 : child.depth === 2 ? 0.64 : 0.52;
    child.x = node.x + (child.x - node.x) * factor;
    child.y = node.y + (child.y - node.y) * factor;
    compressToward(child);
  }
}

type Tooltip = { node: Node; clientX: number; clientY: number };

/** A zoomable circle-packing map: every category, subcategory, and
 * individual comment is a bubble, sized by how many comments it holds and
 * nested inside its parent, rendered as soft overlapping glows (radial
 * gradient + screen blend) rather than flat opaque shapes. Everything
 * starts folded into one "Commentary" blob; scrolling (or the +/- buttons)
 * zooms continuously, revealing categories, then subcategories, then
 * individual comments in turn — the same way a map reveals more detail as
 * you get closer, rather than jumping between separate screens. Circle
 * positions/radii come from d3-hierarchy's pack() layout (then deliberately
 * compressed to overlap), computed once per categories prop; panning and
 * zooming afterward are pure transform math applied directly to the DOM
 * (bypassing React state) so dragging/scrolling stays smooth even with a
 * few hundred bubbles on screen. */
export function CommentMap({ categories }: { categories: SocialCommentCategory[] }) {
  const uid = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const circleRefs = useRef(new Map<number, SVGCircleElement>());
  const labelRefs = useRef(new Map<number, SVGGElement>());
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const dragState = useRef<{ startX: number; startY: number; startTx: number; startTy: number; moved: boolean } | null>(
    null
  );
  // handlePointerUp clears dragState.current before the browser's own
  // subsequent "click" event fires (pointerup -> click is always the
  // sequence, regardless of movement in between) — so reading
  // dragState.current?.moved from a click handler always saw it already
  // nulled out, meaning every pan-then-release was immediately followed by
  // a click that (wrongly) treated it as a plain click and reset/re-zoomed
  // the view right back. This ref captures the moved flag at the moment of
  // release, before it's cleared, so the click handlers can still see it.
  const wasDraggingRef = useRef(false);

  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [selected, setSelected] = useState<SocialComment | null>(null);

  const root = useMemo(() => {
    const data: PackNode = {
      name: "Commentary",
      kind: "root",
      children: categories.map((cat) => ({
        name: cat.name,
        kind: "category",
        children: cat.subcategories.map((sub) => ({
          name: sub.name,
          kind: "subcategory",
          children: sub.comments.map((c) => ({ name: c.author, kind: "comment", comment: c, value: 1 })),
        })),
      })),
    };
    const h = hierarchy<PackNode>(data)
      .sum((d) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    pack<PackNode>()
      .size([VIEW_SIZE, VIEW_SIZE])
      .padding((d) => (d.depth === 0 ? 30 : d.depth === 1 ? 12 : 2))(h);
    compressToward(h as Node);
    return h;
  }, [categories]);

  const nodes = useMemo(() => root.descendants() as Node[], [root]);
  const labelNodes = useMemo(() => nodes.filter((n) => n.depth <= 2), [nodes]);

  function applyTransform(withTransition: boolean) {
    const { x, y, k } = transformRef.current;
    const g = groupRef.current;
    if (g) {
      g.style.transition = withTransition ? ZOOM_TRANSITION : "none";
      g.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
      g.style.transformOrigin = "0 0";
    }
    circleRefs.current.forEach((el, index) => {
      const node = nodes[index];
      if (!node) return;
      const opacity = stageOpacity(node.depth, k);
      el.style.transition = withTransition ? "opacity 400ms ease" : "none";
      el.style.opacity = String(opacity);
      el.style.pointerEvents = opacity > 0.05 ? "auto" : "none";
    });
    labelRefs.current.forEach((el, index) => {
      const node = labelNodes[index];
      if (!node) return;
      el.style.transition = withTransition ? ZOOM_TRANSITION : "none";
      el.style.transform = `scale(${1 / k})`;
      // A label whose bubble renders too small on screen just adds clutter
      // (several overlapping subcategory bubbles' names all fighting for
      // the same few pixels) rather than being readable — fade it out
      // below a minimum rendered radius instead of showing it regardless.
      const onScreenRadius = node.r * k;
      const sizeFactor = clamp((onScreenRadius - MIN_LABEL_RADIUS) / 20, 0, 1);
      el.style.opacity = String(stageOpacity(node.depth, k) * sizeFactor);
    });
    if (withTransition) {
      window.setTimeout(() => {
        if (groupRef.current) groupRef.current.style.transition = "none";
        circleRefs.current.forEach((el) => {
          el.style.transition = "none";
        });
        labelRefs.current.forEach((el) => {
          el.style.transition = "none";
        });
      }, 560);
    }
  }

  useEffect(() => {
    applyTransform(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  // The container (h-[28rem] w-full) is never actually square, but the
  // viewBox is — with the SVG default preserveAspectRatio ("xMidYMid
  // meet"), the browser scales uniformly by the SMALLER of width/height and
  // letterboxes the rest, rather than stretching each axis independently.
  // Converting client coordinates with rect.width and rect.height as two
  // separate ratios (as this used to) ignores both that shared scale and
  // the letterbox offset, so drags and clicks silently drifted from the
  // cursor on any non-square viewport — which is most of them.
  function toViewBox(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: VIEW_SIZE / 2, y: VIEW_SIZE / 2 };
    const scale = Math.min(rect.width, rect.height) / VIEW_SIZE;
    const offsetX = (rect.width - VIEW_SIZE * scale) / 2;
    const offsetY = (rect.height - VIEW_SIZE * scale) / 2;
    return { x: (clientX - rect.left - offsetX) / scale, y: (clientY - rect.top - offsetY) / scale };
  }

  function zoomToward(px: number, py: number, factor: number, withTransition: boolean) {
    const { x, y, k } = transformRef.current;
    const newK = clamp(k * factor, MIN_K, MAX_K);
    const worldX = (px - x) / k;
    const worldY = (py - y) / k;
    transformRef.current = { x: px - worldX * newK, y: py - worldY * newK, k: newK };
    applyTransform(withTransition);
  }

  function focusOn(node: Node) {
    const targetK = clamp((VIEW_SIZE * 0.88) / (node.r * 2), MIN_K, MAX_K);
    transformRef.current = {
      x: VIEW_SIZE / 2 - node.x * targetK,
      y: VIEW_SIZE / 2 - node.y * targetK,
      k: targetK,
    };
    applyTransform(true);
  }

  function resetView() {
    transformRef.current = { x: 0, y: 0, k: 1 };
    applyTransform(true);
  }

  // Wheel is attached natively (not via JSX onWheel) so preventDefault
  // reliably stops the page itself from scrolling — React 17+ treats wheel
  // listeners as passive by default, which silently ignores preventDefault.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const { x: px, y: py } = toViewBox(e.clientX, e.clientY);
      const factor = Math.pow(1.0016, -e.deltaY);
      zoomToward(px, py, factor, false);
    }
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTx: transformRef.current.x,
      startTy: transformRef.current.y,
      moved: false,
    };
    svgRef.current?.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const ds = dragState.current;
    if (!ds) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scale = Math.min(rect.width, rect.height) / VIEW_SIZE;
    const dx = (e.clientX - ds.startX) / scale;
    const dy = (e.clientY - ds.startY) / scale;
    if (!ds.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
      ds.moved = true;
      setTooltip(null);
    }
    if (!ds.moved) return;
    transformRef.current = { ...transformRef.current, x: ds.startTx + dx, y: ds.startTy + dy };
    applyTransform(false);
  }

  function handlePointerUp() {
    wasDraggingRef.current = dragState.current?.moved ?? false;
    dragState.current = null;
  }

  function handleNodeClick(node: Node, clickX: number, clickY: number) {
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      return;
    }
    if (node.data.kind === "comment" && node.data.comment) {
      setSelected(node.data.comment);
    } else if (node.depth === 0) {
      // The root "Commentary" blob itself isn't a meaningful zoom target —
      // fitting it to the view is a no-op since it's already what's shown.
      // Zoom in a step centered on wherever was clicked instead, so a click
      // anywhere on it is always useful rather than a dead click.
      zoomToward(clickX, clickY, 2.2, true);
    } else {
      focusOn(node);
    }
  }

  function handleBackgroundClick() {
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      return;
    }
    resetView();
  }

  if (nodes.length <= 1) return null;

  const paletteColors = [...new Set([...Object.values(CATEGORY_COLORS), FALLBACK_COLOR])];

  return (
    <div className="relative">
      <div
        className="relative h-[28rem] w-full select-none overflow-hidden rounded-lg sm:h-[34rem]"
        style={{
          backgroundColor: "rgba(0,0,0,0.55)",
          border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
          borderRadius: "var(--card-radius, 12px)",
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
          className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
          style={{ touchAction: "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onClick={handleBackgroundClick}
        >
          <defs>
            <radialGradient id={`glow-root-${uid}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0.4} />
              <stop offset="60%" stopColor="#ffffff" stopOpacity={0.14} />
              <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
            </radialGradient>
            {paletteColors.map((color) => (
              <radialGradient key={color} id={`glow-${uid}-${slug(color)}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={color} stopOpacity={0.95} />
                <stop offset="55%" stopColor={color} stopOpacity={0.5} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </radialGradient>
            ))}
            {/* A soft shadow reads as polished label legibility; the old
                thick, fully-opaque black stroke read as a cartoon outline
                and made overlapping labels look messy. */}
            <filter id={`label-shadow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor="#000" floodOpacity="0.85" />
            </filter>
          </defs>

          <g ref={groupRef}>
            {nodes.map((node, i) => {
              const categoryName = ancestorCategoryName(node);
              const color = node.depth === 0 ? null : colorFor(categoryName);
              const fillUrl = color ? `url(#glow-${uid}-${slug(color)})` : `url(#glow-root-${uid})`;
              const baseOpacity = node.depth === 1 ? 0.7 : node.depth === 2 ? 0.85 : 1;
              const isHovered = tooltip?.node === node;
              return (
                <circle
                  key={i}
                  ref={(el) => {
                    if (el) circleRefs.current.set(i, el);
                  }}
                  cx={node.x}
                  cy={node.y}
                  r={node.r}
                  fill={fillUrl}
                  fillOpacity={isHovered ? 1 : baseOpacity}
                  style={{ transition: "fill-opacity 150ms ease", mixBlendMode: "screen" }}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    const { x: cx, y: cy } = toViewBox(e.clientX, e.clientY);
                    handleNodeClick(node, cx, cy);
                  }}
                  onPointerEnter={(e) => {
                    if (dragState.current) return;
                    setTooltip({ node, clientX: e.clientX, clientY: e.clientY });
                  }}
                  onPointerMove={(e) => {
                    if (dragState.current) return;
                    setTooltip((t) => (t && t.node === node ? { node, clientX: e.clientX, clientY: e.clientY } : t));
                  }}
                  onPointerLeave={() => setTooltip((t) => (t?.node === node ? null : t))}
                />
              );
            })}
            {labelNodes.map((node, i) => (
              <g key={i} transform={`translate(${node.x},${node.y})`}>
                <g
                  ref={(el) => { if (el) labelRefs.current.set(i, el); }}
                  style={{ filter: `url(#label-shadow-${uid})` }}
                >
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="pointer-events-none select-none font-semibold"
                    style={{ fontSize: node.depth === 0 ? 30 : node.depth === 1 ? 22 : 15, fill: "#fff" }}
                  >
                    {node.data.name}
                  </text>
                  {node.depth === 0 && (
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      y={34}
                      className="pointer-events-none select-none"
                      style={{ fontSize: 15, fill: "rgba(255,255,255,0.75)" }}
                    >
                      {node.value ?? 0} comments · scroll to explore
                    </text>
                  )}
                </g>
              </g>
            ))}
          </g>
        </svg>

        {tooltip && (
          <div
            className="pointer-events-none fixed z-20 max-w-64 rounded-md border border-white/15 bg-neutral-950/95 px-3 py-2 text-xs text-white shadow-xl"
            style={{ left: tooltip.clientX + 14, top: tooltip.clientY + 14 }}
          >
            {tooltip.node.data.kind === "comment" && tooltip.node.data.comment ? (
              <>
                <p className="font-semibold">{tooltip.node.data.comment.author}</p>
                <p className="mt-0.5 opacity-70">{tooltip.node.data.comment.platform === "reddit" ? "Reddit" : "YouTube"}</p>
                <p className="mt-1 line-clamp-3 opacity-90">{tooltip.node.data.comment.text}</p>
              </>
            ) : (
              <>
                <p className="font-semibold">{tooltip.node.data.name}</p>
                <p className="mt-0.5 opacity-70">{tooltip.node.value ?? 0} comment{tooltip.node.value === 1 ? "" : "s"}</p>
              </>
            )}
          </div>
        )}

        <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-md border border-white/20 bg-black/50 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => zoomToward(VIEW_SIZE / 2, VIEW_SIZE / 2, 1.6, true)}
            className="flex h-8 w-8 items-center justify-center text-lg font-bold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Zoom in"
          >
            +
          </button>
          <div className="h-px bg-white/15" />
          <button
            type="button"
            onClick={() => zoomToward(VIEW_SIZE / 2, VIEW_SIZE / 2, 1 / 1.6, true)}
            className="flex h-8 w-8 items-center justify-center text-lg font-bold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Zoom out"
          >
            −
          </button>
        </div>

        <button
          type="button"
          onClick={resetView}
          className="absolute bottom-3 left-3 rounded-md border border-white/20 bg-black/50 px-2.5 py-1 text-xs font-medium text-white/70 backdrop-blur-sm transition-colors hover:bg-white/10 hover:text-white"
        >
          Reset view
        </button>

        <p className="absolute left-3 top-3 text-xs text-white/40">
          Scroll or drag to explore · click a bubble to zoom in
        </p>
      </div>

      {selected && (
        <div
          className="mt-3 p-4 shadow-lg shadow-black/30 backdrop-blur-md"
          style={{
            borderRadius: "var(--card-radius, 12px)",
            backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
            border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div
              className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-60"
              style={{ color: "var(--card-text-color, #fff)" }}
            >
              <span>{selected.platform === "reddit" ? "Reddit" : "YouTube"}</span>
              <span>· {selected.author}</span>
              {selected.score !== null && <span>· {selected.score} pts</span>}
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="shrink-0 text-white/40 transition-colors hover:text-white"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--card-text-color, #fff)" }}>
            {selected.text}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wide opacity-40" style={{ color: "var(--card-text-color, #fff)" }}>
              on: {selected.context}
            </p>
            <a
              href={selected.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-[var(--accent)] hover:underline"
            >
              View original →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
