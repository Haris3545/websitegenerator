"use client";

import { useState, type ReactNode } from "react";
import { useEditMode } from "@/components/site/EditModeContext";
import { useDragReorder } from "@/hooks/useDragReorder";

const END = "__end__";

export type SectionEntry = {
  key: string;
  label: string;
  /** One-line, low-chrome preview shown instead of `content` while
   * reordering, so dragging a stack of full-size cards never turns into
   * fighting a wall of visual noise just to see where things will land. */
  summary: ReactNode;
  content: ReactNode;
};

/** Shared drag-reorder list body behind both DashboardSections and
 * YoutubeSections — same persist-on-drop shape as NavPills/DashboardKpiGrid,
 * just one column instead of a grid, and swapping in a condensed `summary`
 * row in place of each section's full `content` for the duration of edit
 * mode. The caller owns how the new order actually gets saved (each tab
 * persists to its own column), passed in as `onReorder`. */
export function ReorderableSections({
  sections: initialSections,
  onReorder,
}: {
  sections: SectionEntry[];
  onReorder: (order: string[]) => void;
}) {
  const { editMode } = useEditMode();
  const [sections, setSections] = useState(initialSections);

  function persist(next: SectionEntry[]) {
    setSections(next);
    onReorder(next.map((s) => s.key));
  }

  const { draggingKey, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useDragReorder(
    (dragKey, overKey) => {
      if (!overKey || overKey === dragKey) return;
      const rest = sections.filter((s) => s.key !== dragKey);
      const dragged = sections.find((s) => s.key === dragKey);
      if (!dragged) return;
      const insertAt = overKey === END ? rest.length : rest.findIndex((s) => s.key === overKey);
      rest.splice(insertAt < 0 ? rest.length : insertAt, 0, dragged);
      persist(rest);
    }
  );

  return (
    <div className="flex flex-col gap-8">
      {sections.map((section) =>
        editMode ? (
          <div
            key={section.key}
            data-reorder-key={section.key}
            onPointerDown={(e) => handlePointerDown(e, section.key)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            style={{ touchAction: "none" }}
            className={`flex touch-none select-none items-center gap-3 rounded-lg border border-dashed border-white/20 bg-white/[0.02] p-3 transition-colors hover:border-white/40 ${
              draggingKey === section.key ? "opacity-40" : ""
            }`}
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
          data-reorder-key={END}
          className="flex min-h-12 items-center justify-center rounded-lg border border-dashed border-white/20 text-center text-xs text-white/30"
        >
          Drag sections to reorder
        </div>
      )}
    </div>
  );
}
