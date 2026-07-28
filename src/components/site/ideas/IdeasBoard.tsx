"use client";

import { useState, useTransition } from "react";
import { deleteIdeaCard, updateIdeaStatuses } from "@/app/s/[slug]/actions";
import { SwipeStack } from "@/components/site/ideas/SwipeStack";
import { IdeaFolderView } from "@/components/site/ideas/IdeaFolderView";
import { IdeaFormModal } from "@/components/site/ideas/IdeaFormModal";
import { ScheduleModal } from "@/components/site/ideas/ScheduleModal";
import { PoofEffectProvider } from "@/hooks/usePoofEffect";
import type { SwipeDirection } from "@/hooks/useSwipeGesture";
import type { BoardItem } from "@/lib/database.types";

/** A small tilted preview stack for a folder button — echoes the main
 * swipe stack's visual language at a glance instead of a plain text pill,
 * so "Liked"/"Disliked" read as an actual pile of ideas. */
function FolderMiniStack({
  label,
  items,
  onClick,
}: {
  label: string;
  items: BoardItem[];
  onClick: () => void;
}) {
  const preview = items.slice(0, 3).reverse();
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 py-2 pl-3 pr-4 text-left transition-colors hover:border-white/30 hover:bg-white/10"
    >
      <div className="relative h-11 w-9 shrink-0">
        {preview.length === 0 ? (
          <div className="absolute inset-0 rounded-lg border border-dashed border-white/15" />
        ) : (
          preview.map((item, i) => (
            <div
              key={item.id}
              className="absolute inset-0 overflow-hidden rounded-lg border border-white/20 shadow-md shadow-black/40"
              style={{ transform: `rotate(${(i - (preview.length - 1) / 2) * 8}deg)`, zIndex: i }}
            >
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-white/10" />
              )}
            </div>
          ))
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-white/80 group-hover:text-white">{label}</p>
        <p className="text-xs text-white/40">
          {items.length} idea{items.length === 1 ? "" : "s"}
        </p>
      </div>
    </button>
  );
}

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
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  // Deferred by the same duration as .animate-poof (see globals.css) so the
  // swipe stack's top card can play that shrink-and-fade in place — the
  // stack's SwipeCard.tsx reads isDeleting off this id and stays the exact
  // same rendered instance throughout, so there's nothing to remount/race.
  function handleDeleteItem(item: BoardItem) {
    setDeletingId(item.id);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setDeletingId(null);
      startTransition(() => {
        deleteIdeaCard(item.id, slug);
      });
    }, 170);
  }

  const folderItems = openFolder === "liked" ? liked : openFolder === "disliked" ? disliked : [];

  return (
    <PoofEffectProvider>
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowNewIdeaModal(true)}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition-all duration-150 ease-out hover:-translate-y-0.5 hover:brightness-110"
        >
          + New idea
        </button>

        <div className="flex gap-3">
          <FolderMiniStack label="Liked" items={liked} onClick={() => setOpenFolder("liked")} />
          <FolderMiniStack label="Disliked" items={disliked} onClick={() => setOpenFolder("disliked")} />
        </div>
      </div>

      <div className="flex min-h-[440px] items-center justify-center py-4">
        <SwipeStack
          items={pending}
          onDecision={handleDecision}
          onEdit={(item) => setEditingItem(item)}
          onDelete={handleDeleteItem}
          deletingId={deletingId}
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
          onScheduled={({ calendar_status, scheduled_date, scheduled_time }) => {
            setItems((prev) =>
              prev.map((i) =>
                i.id === schedulingItem.id ? { ...i, calendar_status, scheduled_date, scheduled_time } : i
              )
            );
          }}
        />
      )}
    </div>
    </PoofEffectProvider>
  );
}
