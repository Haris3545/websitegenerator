"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useEditMode } from "@/components/site/EditModeContext";
import { updateDashboardSectionOrder } from "@/app/s/[slug]/actions";

export type DashboardSectionEntry = {
  key: string;
  label: string;
  /** One-line, low-chrome preview shown instead of `content` while
   * reordering, so dragging a stack of full-size cards never turns into
   * fighting a wall of visual noise just to see where things will land. */
  summary: ReactNode;
  content: ReactNode;
};

/** Lets a visitor drag-reorder the Dashboard's own content sections ("What
 * we've noticed", Wikipedia pageviews, "Most relevant coverage") — same
 * persist-on-drop shape as NavPills/DashboardKpiGrid, just one column
 * instead of a grid, and swapping in a condensed `summary` row in place of
 * each section's full `content` for the duration of edit mode. */
export function DashboardSections({
  artistId,
  sections: initialSections,
}: {
  artistId: string;
  sections: DashboardSectionEntry[];
}) {
  const { editMode } = useEditMode();
  const [, startTransition] = useTransition();
  const [sections, setSections] = useState(initialSections);
  const [dragKey, setDragKey] = useState<string | null>(null);

  function persist(next: DashboardSectionEntry[]) {
    setSections(next);
    startTransition(() => {
      updateDashboardSectionOrder(artistId, next.map((s) => s.key));
    });
  }

  function moveTo(beforeKey: string | null) {
    if (!dragKey || dragKey === beforeKey) return;
    const rest = sections.filter((s) => s.key !== dragKey);
    const dragged = sections.find((s) => s.key === dragKey);
    if (!dragged) return;
    const insertAt = beforeKey ? rest.findIndex((s) => s.key === beforeKey) : rest.length;
    rest.splice(insertAt < 0 ? rest.length : insertAt, 0, dragged);
    persist(rest);
  }

  return (
    <div className="flex flex-col gap-8">
      {sections.map((section) =>
        editMode ? (
          <div
            key={section.key}
            draggable
            onDragStart={() => setDragKey(section.key)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              moveTo(section.key);
              setDragKey(null);
            }}
            className="flex select-none items-center gap-3 rounded-lg border border-dashed border-white/20 bg-white/[0.02] p-3 transition-colors hover:border-white/40"
          >
            <span
              className="cursor-grab text-lg leading-none text-white/30 active:cursor-grabbing"
              aria-hidden
              title="Drag to reorder"
            >
              ⠿⠿
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{section.label}</p>
              <div className="mt-0.5 truncate text-xs text-white/40">{section.summary}</div>
            </div>
          </div>
        ) : (
          <div key={section.key}>{section.content}</div>
        )
      )}
      {editMode && (
        <div
          onDragOver={(e) => dragKey && e.preventDefault()}
          onDrop={(e) => {
            if (!dragKey) return;
            e.preventDefault();
            moveTo(null);
            setDragKey(null);
          }}
          className="flex min-h-12 items-center justify-center rounded-lg border border-dashed border-white/20 text-center text-xs text-white/30"
        >
          Drag sections to reorder
        </div>
      )}
    </div>
  );
}
