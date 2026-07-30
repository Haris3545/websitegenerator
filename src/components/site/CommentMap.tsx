"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SocialComment, SocialCommentCategory } from "@/lib/database.types";

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

// Comments are swept up to this cap (see MAX_COMMENTS in
// socialListening.ts) — past it, the real total could be higher than
// what's actually stored, so the count reads as "1,000+" rather than
// implying that's the literal, exhaustive number of comments that exist.
const COMMENT_CAP = 1000;

function formatCount(n: number): string {
  return n >= COMMENT_CAP ? `${COMMENT_CAP.toLocaleString()}+` : n.toLocaleString();
}

function platformLabel(platform: SocialComment["platform"]): string {
  if (platform === "reddit") return "Reddit";
  if (platform === "youtube") return "YouTube";
  return "Web";
}

function colorFor(categoryName: string): string {
  return CATEGORY_COLORS[categoryName] ?? FALLBACK_COLOR;
}

// Lightens a hex color toward white by `amount` (0 = unchanged, 1 = white)
// — used to give a drilled-down category's subcategories their own
// distinguishable segments while still visibly reading as "part of the
// same family" as the parent's own color.
function tint(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const nr = Math.round(r + (255 - r) * amount);
  const ng = Math.round(g + (255 - g) * amount);
  const nb = Math.round(b + (255 - b) * amount);
  return `rgb(${nr}, ${ng}, ${nb})`;
}

// Accepts either "#rrggbb" or "rgb(r, g, b)" (subcategory arcs are already
// tinted into the latter form) so the flow-color blend below works
// regardless of which kind of color string a given arc has.
function parseColor(c: string): [number, number, number] {
  if (c.startsWith("#")) {
    const num = parseInt(c.slice(1), 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  const nums = c.match(/\d+(?:\.\d+)?/g);
  if (nums && nums.length >= 3) return [Number(nums[0]), Number(nums[1]), Number(nums[2])];
  return [255, 255, 255];
}

// Blends a color toward another by `amount` — used to make the rest of the
// ring read as "flooded" by whichever segment was just clicked, rather than
// just dimming everything else.
function mixColor(from: string, toward: string, amount: number): string {
  const [r1, g1, b1] = parseColor(from);
  const [r2, g2, b2] = parseColor(toward);
  const r = Math.round(r1 + (r2 - r1) * amount);
  const g = Math.round(g1 + (g2 - g1) * amount);
  const b = Math.round(b1 + (b2 - b1) * amount);
  return `rgb(${r}, ${g}, ${b})`;
}

const FLOW_AMOUNT = 0.82;
// The whole ring finishes flowing (or retreating) in this long, sweeping
// clockwise around from wherever the flow originated rather than each arc's
// color just crossfading in place all at once.
const FLOW_TOTAL_MS = 600;
const FLOW_TRANSITION_MS = 260;

const CENTER = 300;
const RING_R = 220;
const RING_STROKE = 46;
const GAP_DEG = 2.2;

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polarToCartesian(cx, cy, r, endDeg);
  const end = polarToCartesian(cx, cy, r, startDeg);
  const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

type Arc = {
  name: string;
  color: string;
  count: number;
  share: number;
  comments: SocialComment[];
  path: string;
};

function buildArcs(entries: { name: string; color: string; comments: SocialComment[] }[]): Arc[] {
  const withCounts = entries
    .map((e) => ({ ...e, count: e.comments.length }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count);

  const total = withCounts.reduce((s, e) => s + e.count, 0);
  if (total === 0) return [];

  let angle = -90;
  return withCounts.map((e) => {
    const share = e.count / total;
    const sweep = share * 360 - GAP_DEG;
    const path = describeArc(CENTER, CENTER, RING_R, angle, angle + Math.max(sweep, 2));
    angle += share * 360;
    return { ...e, share, path };
  });
}

/** An Activity-ring-style segmented ring: arc length reads as each
 * category's share of all comments, colour reads as category, and the
 * legend beside it gives the exact percentage/count so nothing depends on
 * judging an angle by eye. Clicking a top-level segment drills into that
 * category's own subcategories — the ring redraws as a second breakdown
 * (tinted shades of the parent's colour) instead of just listing quotes,
 * so a broad bucket like "Reactions" can still be explored further. */
export function CommentMap({ categories }: { categories: SocialCommentCategory[] }) {
  const [drilledInto, setDrilledInto] = useState<SocialCommentCategory | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  // Stays put (doesn't reset to null) even after deselecting — the flow's
  // stagger distance is computed from whichever segment was most recently
  // toggled, so retreating radiates back toward the same origin point the
  // flow-out came from instead of snapping in from nowhere.
  const [flowFrom, setFlowFrom] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const topArcs = useMemo(
    () =>
      buildArcs(
        categories.map((cat) => ({
          name: cat.name,
          color: colorFor(cat.name),
          comments: cat.subcategories.flatMap((s) => s.comments),
        }))
      ),
    [categories]
  );

  const subArcs = useMemo(() => {
    if (!drilledInto) return [];
    const baseColor = colorFor(drilledInto.name);
    const n = drilledInto.subcategories.length;
    return buildArcs(
      drilledInto.subcategories.map((sub, i) => ({
        name: sub.name,
        color: n <= 1 ? baseColor : tint(baseColor, (i / (n - 1)) * 0.55),
        comments: sub.comments,
      }))
    );
  }, [drilledInto]);

  const grandTotal = topArcs.reduce((s, a) => s + a.count, 0);

  // Clicking off the ring/legend (anywhere else in the card, or outside it
  // entirely) retreats the flow the same way toggling the same segment
  // again would. Runs before the early return below so hook order stays
  // consistent regardless of whether there's any data to show.
  useEffect(() => {
    if (selected === null) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setSelected(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [selected]);

  if (topArcs.length === 0) return null;

  const arcs = drilledInto ? subArcs : topArcs;
  const displayedTotal = arcs.reduce((s, a) => s + a.count, 0);
  const selectedArc = selected !== null ? arcs[selected] : null;

  function toggle(i: number) {
    setFlowFrom(i);
    setSelected((s) => (s === i ? null : i));
  }

  function drillInto(cat: SocialCommentCategory) {
    setDrilledInto(cat);
    setSelected(null);
    setFlowFrom(null);
  }

  function backToTop() {
    setDrilledInto(null);
    setSelected(null);
    setFlowFrom(null);
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-5 p-5"
      style={{
        backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
        border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
        borderRadius: "var(--card-radius, 12px)",
      }}
    >
      {drilledInto && (
        <button
          type="button"
          onClick={backToTop}
          className="flex w-fit items-center gap-1.5 text-xs font-medium text-white/50 transition-colors hover:text-white/80"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden>
            <path d="m12.5 5.5-5 4.5 5 4.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All categories
          <span style={{ color: colorFor(drilledInto.name) }}>· {drilledInto.name}</span>
        </button>
      )}

      {!drilledInto && (
        <p className="text-[11px] uppercase tracking-wide text-white/30">
          Click a category to see samples · double-click to explore its subcategories
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="relative mx-auto flex h-56 w-56 shrink-0 items-center justify-center sm:h-64 sm:w-64">
          <svg viewBox="0 0 600 600" className="h-full w-full">
            {arcs.map((a, i) => {
              // The rest of the ring blends toward whichever segment is
              // selected, staggered clockwise from wherever the flow
              // originated so the whole ring reads as one ~600ms sweep
              // around the circle (and the same sweep in reverse on
              // deselect) rather than every arc crossfading at once.
              const flowTarget = selected !== null && selected !== i ? arcs[selected]?.color : null;
              const displayColor = flowTarget ? mixColor(a.color, flowTarget, FLOW_AMOUNT) : a.color;
              const origin = flowFrom ?? i;
              const clockwiseDist = arcs.length > 0 ? (i - origin + arcs.length) % arcs.length : 0;
              const maxDelay = FLOW_TOTAL_MS - FLOW_TRANSITION_MS;
              const delayMs =
                arcs.length > 1 ? Math.round((clockwiseDist / (arcs.length - 1)) * maxDelay) : 0;
              return (
                <path
                  key={a.name}
                  d={a.path}
                  stroke={displayColor}
                  strokeWidth={RING_STROKE}
                  fill="none"
                  strokeLinecap="round"
                  className="cursor-pointer"
                  style={{
                    filter: selected === i ? "brightness(1.18)" : undefined,
                    transition: `stroke ${FLOW_TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1), filter 300ms ease`,
                    transitionDelay: `${delayMs}ms`,
                  }}
                  onClick={() => toggle(i)}
                  onDoubleClick={() => {
                    if (drilledInto) return;
                    const cat = categories.find((c) => c.name === a.name);
                    if (cat) drillInto(cat);
                  }}
                />
              );
            })}
          </svg>
          <div className="pointer-events-none absolute flex flex-col items-center gap-0.5">
            <span
              className="text-4xl font-bold tabular-nums"
              style={{ color: "var(--card-text-color, #fff)" }}
            >
              {drilledInto ? formatCount(displayedTotal) : formatCount(grandTotal)}
            </span>
            <span className="max-w-[7rem] truncate text-[11px] uppercase tracking-wide text-white/40">
              {drilledInto ? drilledInto.name : "comments"}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          {arcs.map((a, i) => (
            <button
              key={a.name}
              type="button"
              onClick={() => toggle(i)}
              onDoubleClick={() => {
                if (drilledInto) return;
                const cat = categories.find((c) => c.name === a.name);
                if (cat) drillInto(cat);
              }}
              className={`grid grid-cols-[12px_1fr_auto_auto] items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                selected === i
                  ? "border-white/15 bg-white/[0.06]"
                  : "border-transparent hover:bg-white/[0.04]"
              }`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: a.color, boxShadow: `0 0 10px 1px ${a.color}` }}
              />
              <span
                className="truncate text-[13.5px] font-medium"
                style={{ color: "var(--card-text-color, #fff)" }}
              >
                {a.name}
              </span>
              <span className="font-mono text-xs tabular-nums text-white/40">
                {Math.round(a.share * 100)}%
              </span>
              <span
                className="min-w-[3ch] text-right font-mono text-[13.5px] font-semibold tabular-nums"
                style={{ color: "var(--card-text-color, #fff)" }}
              >
                {a.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {selectedArc && (
        <div
          className="flex flex-col gap-2.5 pt-4"
          style={{ borderTop: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))" }}
        >
          <p className="text-sm font-semibold" style={{ color: selectedArc.color }}>
            {selectedArc.name} — sample comments
          </p>
          {selectedArc.comments.slice(0, 4).map((c, i) => (
            <a
              key={i}
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block border-l-2 pl-3 text-sm opacity-90 transition-opacity hover:opacity-100"
              style={{ borderColor: selectedArc.color, color: "var(--card-text-color, #fff)" }}
            >
              <span className="line-clamp-3">&ldquo;{c.text}&rdquo;</span>
              <span className="mt-0.5 block text-xs opacity-50">
                — {c.author} · {platformLabel(c.platform)}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
