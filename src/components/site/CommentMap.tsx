"use client";

import { useMemo, useState } from "react";
import type { SocialCommentCategory } from "@/lib/database.types";

type Rect = { key: string; x: number; y: number; width: number; height: number; value: number };

/** A simple "slice and dice" treemap — recursively splits the available
 * rectangle in two (alternating horizontal/vertical) at the point that
 * divides the items' total value as evenly as possible. Not the prettiest
 * squarified variant, but area stays honestly proportional to value, which
 * is what makes this read as a real map rather than a decorated list. */
function layoutTreemap(
  items: { key: string; value: number }[],
  x: number,
  y: number,
  width: number,
  height: number,
  horizontal: boolean
): Rect[] {
  if (!items.length) return [];
  if (items.length === 1) return [{ key: items[0].key, x, y, width, height, value: items[0].value }];

  const total = items.reduce((sum, n) => sum + n.value, 0);
  let acc = 0;
  let splitIndex = 1;
  for (let i = 0; i < items.length; i++) {
    acc += items[i].value;
    if (acc >= total / 2) {
      splitIndex = i + 1;
      break;
    }
  }
  splitIndex = Math.max(1, Math.min(items.length - 1, splitIndex));

  const groupA = items.slice(0, splitIndex);
  const groupB = items.slice(splitIndex);
  const fracA = groupA.reduce((s, n) => s + n.value, 0) / total;

  if (horizontal) {
    const widthA = width * fracA;
    return [
      ...layoutTreemap(groupA, x, y, widthA, height, false),
      ...layoutTreemap(groupB, x + widthA, y, width - widthA, height, false),
    ];
  }
  const heightA = height * fracA;
  return [
    ...layoutTreemap(groupA, x, y, width, heightA, true),
    ...layoutTreemap(groupB, x, y + heightA, width, height - heightA, true),
  ];
}

type View =
  | { level: "categories" }
  | { level: "subcategories"; categoryIndex: number }
  | { level: "comments"; categoryIndex: number; subcategoryIndex: number };

export function CommentMap({ categories }: { categories: SocialCommentCategory[] }) {
  const [view, setView] = useState<View>({ level: "categories" });

  const categoryCounts = useMemo(
    () =>
      categories.map((c) => c.subcategories.reduce((sum, s) => sum + s.comments.length, 0)),
    [categories]
  );

  if (view.level === "categories") {
    const rects = layoutTreemap(
      categories.map((c, i) => ({ key: String(i), value: categoryCounts[i] || 1 })),
      0,
      0,
      100,
      100,
      true
    );
    return (
      <div className="relative h-80 w-full overflow-hidden rounded-lg sm:h-96">
        {rects.map((r) => {
          const i = Number(r.key);
          return (
            <MapTile
              key={r.key}
              rect={r}
              label={categories[i].name}
              count={categoryCounts[i]}
              onClick={() => setView({ level: "subcategories", categoryIndex: i })}
            />
          );
        })}
      </div>
    );
  }

  if (view.level === "subcategories") {
    const category = categories[view.categoryIndex];
    const subCounts = category.subcategories.map((s) => s.comments.length);
    const rects = layoutTreemap(
      category.subcategories.map((s, i) => ({ key: String(i), value: subCounts[i] || 1 })),
      0,
      0,
      100,
      100,
      true
    );
    return (
      <div>
        <Breadcrumb
          items={[
            { label: "All categories", onClick: () => setView({ level: "categories" }) },
            { label: category.name },
          ]}
        />
        <div className="relative mt-3 h-80 w-full overflow-hidden rounded-lg sm:h-96">
          {rects.map((r) => {
            const i = Number(r.key);
            return (
              <MapTile
                key={r.key}
                rect={r}
                label={category.subcategories[i].name}
                count={subCounts[i]}
                onClick={() =>
                  setView({ level: "comments", categoryIndex: view.categoryIndex, subcategoryIndex: i })
                }
              />
            );
          })}
        </div>
      </div>
    );
  }

  const category = categories[view.categoryIndex];
  const subcategory = category.subcategories[view.subcategoryIndex];
  return (
    <div>
      <Breadcrumb
        items={[
          { label: "All categories", onClick: () => setView({ level: "categories" }) },
          {
            label: category.name,
            onClick: () => setView({ level: "subcategories", categoryIndex: view.categoryIndex }),
          },
          { label: subcategory.name },
        ]}
      />
      <div className="mt-3 flex flex-col gap-3">
        {subcategory.comments.map((comment, i) => (
          <a
            key={i}
            href={comment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-4 shadow-lg shadow-black/30 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_0_28px_var(--accent)]"
            style={{
              borderRadius: "var(--card-radius, 12px)",
              backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
              border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
            }}
          >
            <div
              className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-60"
              style={{ color: "var(--card-text-color, #fff)" }}
            >
              <span>{comment.platform === "reddit" ? "Reddit" : "YouTube"}</span>
              <span>· {comment.author}</span>
              {comment.score !== null && <span>· {comment.score} pts</span>}
            </div>
            <p className="mt-1 text-sm" style={{ color: "var(--card-text-color, #fff)" }}>
              {comment.text}
            </p>
            <p
              className="mt-2 text-[10px] uppercase tracking-wide opacity-40"
              style={{ color: "var(--card-text-color, #fff)" }}
            >
              on: {comment.context}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}

function MapTile({
  rect,
  label,
  count,
  onClick,
}: {
  rect: Rect;
  label: string;
  count: number;
  onClick: () => void;
}) {
  const area = rect.width * rect.height;
  const small = area < 400; // percentage-area threshold below which the label gets tighter

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute flex flex-col items-center justify-center overflow-hidden border border-white/15 p-2 text-center transition-all duration-150 hover:brightness-110"
      style={{
        left: `${rect.x}%`,
        top: `${rect.y}%`,
        width: `${rect.width}%`,
        height: `${rect.height}%`,
        backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
      }}
    >
      <span
        className={small ? "text-xs font-medium" : "text-sm font-semibold sm:text-base"}
        style={{ color: "var(--card-text-color, #fff)" }}
      >
        {label}
      </span>
      <span className="mt-1 text-xs opacity-50" style={{ color: "var(--card-text-color, #fff)" }}>
        {count} comment{count === 1 ? "" : "s"}
      </span>
    </button>
  );
}

function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-white/50">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="opacity-40">/</span>}
          {item.onClick ? (
            <button type="button" onClick={item.onClick} className="hover:text-white hover:underline">
              {item.label}
            </button>
          ) : (
            <span className="text-white/80">{item.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}
