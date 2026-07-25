"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { hierarchy, pack, type HierarchyCircularNode } from "d3-hierarchy";
import type { SocialComment, SocialCommentCategory } from "@/lib/database.types";

const VIEW_SIZE = 1000;
const MIN_K = 0.8;
const MAX_K = 60;
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
  "General discussion": "#9ca3af",
};
const FALLBACK_COLOR = "#a78bfa";

function colorFor(categoryName: string): string {
  return CATEGORY_COLORS[categoryName] ?? FALLBACK_COLOR;
}

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function ancestorCategoryName(node: Node): string {
  let n: Node | null = node;
  while (n && n.depth > 1) n = n.parent;
  return n?.data.name ?? "General discussion";
}

type Tooltip = { node: Node; clientX: number; clientY: number };

/** A zoomable circle-packing map: every category, subcategory, and
 * individual comment is a bubble, sized by how many comments it holds and
 * nested inside its parent — scroll (or the +/- buttons) zooms continuously
 * rather than jumping between separate screens, so subcategories and then
 * individual comments emerge as you zoom in, the same way a map reveals
 * more detail as you get closer. Circle positions/radii come from
 * d3-hierarchy's pack() layout, computed once per categories prop; panning
 * and zooming afterward are pure transform math applied directly to the DOM
 * (bypassing React state) so dragging/scrolling stays smooth even with a
 * few hundred bubbles on screen. */
export function CommentMap({ categories }: { categories: SocialCommentCategory[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const labelRefs = useRef(new Map<number, SVGGElement>());
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const dragState = useRef<{ startX: number; startY: number; startTx: number; startTy: number; moved: boolean } | null>(
    null
  );

  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [selected, setSelected] = useState<SocialComment | null>(null);

  const root = useMemo(() => {
    const data: PackNode = {
      name: "root",
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
    return h;
  }, [categories]);

  const nodes = useMemo(() => root.descendants().filter((d) => d.depth > 0) as Node[], [root]);
  const labelNodes = useMemo(() => nodes.filter((n) => n.depth === 1 || n.depth === 2), [nodes]);

  function applyTransform(withTransition: boolean) {
    const { x, y, k } = transformRef.current;
    const g = groupRef.current;
    if (g) {
      g.style.transition = withTransition ? ZOOM_TRANSITION : "none";
      g.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
      g.style.transformOrigin = "0 0";
    }
    labelRefs.current.forEach((el, index) => {
      el.style.transition = withTransition ? ZOOM_TRANSITION : "none";
      el.style.transform = `scale(${1 / k})`;
      const node = labelNodes[index];
      if (node?.depth === 2) {
        const screenRadius = node.r * k;
        el.style.opacity = String(clamp((screenRadius - 24) / 40, 0, 1));
      }
    });
    if (withTransition) {
      window.setTimeout(() => {
        if (groupRef.current) groupRef.current.style.transition = "none";
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

  function toViewBox(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: VIEW_SIZE / 2, y: VIEW_SIZE / 2 };
    return { x: ((clientX - rect.left) / rect.width) * VIEW_SIZE, y: ((clientY - rect.top) / rect.height) * VIEW_SIZE };
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
    const dx = ((e.clientX - ds.startX) / rect.width) * VIEW_SIZE;
    const dy = ((e.clientY - ds.startY) / rect.height) * VIEW_SIZE;
    if (!ds.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) ds.moved = true;
    if (!ds.moved) return;
    transformRef.current = { ...transformRef.current, x: ds.startTx + dx, y: ds.startTy + dy };
    applyTransform(false);
  }

  function handlePointerUp() {
    dragState.current = null;
  }

  function handleNodeClick(node: Node) {
    if (dragState.current?.moved) return;
    if (node.data.kind === "comment" && node.data.comment) {
      setSelected(node.data.comment);
    } else {
      focusOn(node);
    }
  }

  function handleBackgroundClick() {
    if (dragState.current?.moved) return;
    resetView();
  }

  if (!nodes.length) return null;

  return (
    <div className="relative">
      <div
        className="relative h-[28rem] w-full select-none overflow-hidden rounded-lg sm:h-[34rem]"
        style={{
          backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
          border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
          borderRadius: "var(--card-radius, 12px)",
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
          className="h-full w-full cursor-grab active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onClick={handleBackgroundClick}
        >
          <g ref={groupRef}>
            {nodes.map((node, i) => {
              const isLeaf = node.depth === 3;
              const categoryName = ancestorCategoryName(node);
              const base = colorFor(categoryName);
              const fill = node.depth === 1 ? base : node.depth === 2 ? lighten(base, 0.45) : lighten(base, 0.75);
              const baseOpacity = node.depth === 1 ? 0.5 : node.depth === 2 ? 0.6 : 0.85;
              const isHovered = tooltip?.node === node;
              return (
                <circle
                  key={i}
                  cx={node.x}
                  cy={node.y}
                  r={node.r}
                  fill={fill}
                  fillOpacity={isHovered ? Math.min(1, baseOpacity + 0.25) : baseOpacity}
                  stroke={isLeaf ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.2)"}
                  strokeWidth={isLeaf ? 0.5 : 1}
                  vectorEffect="non-scaling-stroke"
                  style={{ transition: "fill-opacity 150ms ease" }}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNodeClick(node);
                  }}
                  onPointerEnter={(e) => setTooltip({ node, clientX: e.clientX, clientY: e.clientY })}
                  onPointerMove={(e) => setTooltip((t) => (t && t.node === node ? { node, clientX: e.clientX, clientY: e.clientY } : t))}
                  onPointerLeave={() => setTooltip((t) => (t?.node === node ? null : t))}
                />
              );
            })}
            {labelNodes.map((node, i) => (
              <g key={i} transform={`translate(${node.x},${node.y})`}>
                <g ref={(el) => { if (el) labelRefs.current.set(i, el); }}>
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="pointer-events-none select-none font-semibold"
                    style={{ fontSize: node.depth === 1 ? 22 : 15, fill: "#fff", paintOrder: "stroke", stroke: "rgba(0,0,0,0.55)", strokeWidth: 3 }}
                  >
                    {node.data.name}
                  </text>
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
