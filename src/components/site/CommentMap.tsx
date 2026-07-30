"use client";

import { useMemo, useState } from "react";
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

function platformLabel(platform: SocialComment["platform"]): string {
  if (platform === "reddit") return "Reddit";
  if (platform === "youtube") return "YouTube";
  return "Web";
}

function colorFor(categoryName: string): string {
  return CATEGORY_COLORS[categoryName] ?? FALLBACK_COLOR;
}

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

/** An Activity-ring-style segmented ring: arc length reads as each
 * category's share of all comments, colour reads as category, and the
 * legend beside it gives the exact percentage/count so nothing depends on
 * judging an angle by eye. Replaces the previous zoomable circle-packing
 * map — that asked someone to zoom and pan through nested glowing bubbles
 * just to find anything, where this puts the whole breakdown on screen at
 * once. Clicking a ring segment or its legend row reveals a handful of
 * real comments from that category below. */
export function CommentMap({ categories }: { categories: SocialCommentCategory[] }) {
  const [selected, setSelected] = useState<number | null>(null);

  const arcs = useMemo<Arc[]>(() => {
    const summaries = categories
      .map((cat) => {
        const comments = cat.subcategories.flatMap((s) => s.comments);
        return { name: cat.name, color: colorFor(cat.name), count: comments.length, comments };
      })
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);

    const total = summaries.reduce((s, c) => s + c.count, 0);
    if (total === 0) return [];

    let angle = -90;
    return summaries.map((cat) => {
      const share = cat.count / total;
      const sweep = share * 360 - GAP_DEG;
      const path = describeArc(CENTER, CENTER, RING_R, angle, angle + Math.max(sweep, 2));
      angle += share * 360;
      return { ...cat, share, path };
    });
  }, [categories]);

  const total = arcs.reduce((s, a) => s + a.count, 0);

  if (arcs.length === 0) return null;

  const selectedArc = selected !== null ? arcs[selected] : null;

  function toggle(i: number) {
    setSelected((s) => (s === i ? null : i));
  }

  return (
    <div
      className="flex flex-col gap-5 p-5"
      style={{
        backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
        border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
        borderRadius: "var(--card-radius, 12px)",
      }}
    >
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="relative mx-auto flex h-56 w-56 shrink-0 items-center justify-center sm:h-64 sm:w-64">
          <svg viewBox="0 0 600 600" className="h-full w-full">
            {arcs.map((a, i) => (
              <path
                key={a.name}
                d={a.path}
                stroke={a.color}
                strokeWidth={RING_STROKE}
                fill="none"
                strokeLinecap="round"
                className="cursor-pointer transition-[filter,opacity] duration-200"
                style={{
                  filter: selected === i ? "brightness(1.18)" : undefined,
                  opacity: selected === null || selected === i ? 1 : 0.38,
                }}
                onClick={() => toggle(i)}
              />
            ))}
          </svg>
          <div className="pointer-events-none absolute flex flex-col items-center gap-0.5">
            <span
              className="text-4xl font-bold tabular-nums"
              style={{ color: "var(--card-text-color, #fff)" }}
            >
              {total.toLocaleString()}
            </span>
            <span className="text-[11px] uppercase tracking-wide text-white/40">comments</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          {arcs.map((a, i) => (
            <button
              key={a.name}
              type="button"
              onClick={() => toggle(i)}
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
