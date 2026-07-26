"use client";

import { useState, useTransition } from "react";
import { deleteIdeaCard, updateIdeaStatuses } from "@/app/s/[slug]/actions";
import { SwipeStack } from "@/components/site/ideas/SwipeStack";
import { IdeaFolderView } from "@/components/site/ideas/IdeaFolderView";
import { IdeaFormModal } from "@/components/site/ideas/IdeaFormModal";
import { ScheduleModal } from "@/components/site/ideas/ScheduleModal";
import type { SwipeDirection } from "@/hooks/useSwipeGesture";
import type { BoardItem } from "@/lib/database.types";

/** The whole Ideas tab: a Tinder-style swipe stack in the middle, with
 * Liked/Disliked folder buttons below it — replaces BoardList.tsx (the
 * plain title+body list Strategy/Tactics/Research still use) with a
 * dedicated, image-first, drag-driven experience per the reference mockups. */
export function IdeasBoard({
  artistId,
  slug,
  initialItems,
}: {
  artistId: string;
  slug: string;
  initialItems: BoardItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [showNewIdeaModal, setShowNewIdeaModal] = useState(false);
  const [editingItem, setEditingItem] = useState<BoardItem | null>(null);
  const [schedulingItem, setSchedulingItem] = useState<BoardItem | null>(null);
  const [openFolder, setOpenFolder] = useState<"liked" | "disliked" | null>(null);
  const [, startTransition] = useTransition();

  const pending = items.filter((i) => i.status === "pending");
  const liked = items.filter((i) => i.status === "liked");
  const disliked = items.filter((i) => i.status === "disliked");

  function handleDecision(id: string, direction: SwipeDirection) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: direction } : i)));
    startTransition(() => {
      updateIdeaStatuses([id], direction, slug);
    });
  }

  function handleStatusChange(ids: string[], status: "pending" | "liked" | "disliked") {
    setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, status } : i)));
    startTransition(() => {
      updateIdeaStatuses(ids, status, slug);
    });
  }

  function handleSaved(item: BoardItem) {
    setItems((prev) => {
      const exists = prev.some((i) => i.id === item.id);
      return exists ? prev.map((i) => (i.id === item.id ? item : i)) : [item, ...prev];
    });
  }

  function handleDeleteItem(item: BoardItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    startTransition(() => {
      deleteIdeaCard(item.id, slug);
    });
  }

  const folderItems = openFolder === "liked" ? liked : openFolder === "disliked" ? disliked : [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowNewIdeaModal(true)}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition-all duration-150 ease-out hover:-translate-y-0.5 hover:brightness-110"
        >
          + New idea
        </button>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpenFolder("liked")}
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:border-white/30 hover:bg-white/10"
          >
            Liked <span className="text-white/40">({liked.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setOpenFolder("disliked")}
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:border-white/30 hover:bg-white/10"
          >
            Disliked <span className="text-white/40">({disliked.length})</span>
          </button>
        </div>
      </div>

      <div className="flex min-h-[440px] items-center justify-center py-4">
        <SwipeStack
          items={pending}
          onDecision={handleDecision}
          onEdit={(item) => setEditingItem(item)}
          onDelete={handleDeleteItem}
        />
      </div>

      {showNewIdeaModal && (
        <IdeaFormModal
          artistId={artistId}
          slug={slug}
          onClose={() => setShowNewIdeaModal(false)}
          onSaved={handleSaved}
        />
      )}

      {editingItem && (
        <IdeaFormModal
          artistId={artistId}
          slug={slug}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={handleSaved}
        />
      )}

      {openFolder && (
        <IdeaFolderView
          folder={openFolder}
          items={folderItems}
          onClose={() => setOpenFolder(null)}
          onStatusChange={handleStatusChange}
          onEdit={(item) => {
            setOpenFolder(null);
            setEditingItem(item);
          }}
          onDelete={(item) => {
            setOpenFolder(null);
            handleDeleteItem(item);
          }}
          onSchedule={(item) => {
            setOpenFolder(null);
            setSchedulingItem(item);
          }}
        />
      )}

      {schedulingItem && (
        <ScheduleModal
          artistId={artistId}
          slug={slug}
          item={schedulingItem}
          onClose={() => setSchedulingItem(null)}
          onScheduled={(update) => {
            setItems((prev) => prev.map((i) => (i.id === schedulingItem.id ? { ...i, ...update } : i)));
          }}
        />
      )}
    </div>
  );
}
