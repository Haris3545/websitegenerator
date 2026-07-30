"use client";

import { useState } from "react";
import { deleteBoardItem, restoreBoardItem } from "@/app/s/[slug]/actions";
import { PoofEffectProvider } from "@/hooks/usePoofEffect";
import { RestoreDeletedPopover } from "@/components/site/RestoreDeletedPopover";
import { TacticCard } from "@/components/site/tactics/TacticCard";
import { TacticFormModal } from "@/components/site/tactics/TacticFormModal";
import type { BoardItem } from "@/lib/database.types";

const cardStyle = {
  borderRadius: "var(--card-radius, 12px)",
  backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
  border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
} as const;

const textStyle = { color: "var(--card-text-color, #fff)" } as const;

function TacticsBoardInner({
  artistId,
  slug,
  initialItems,
  initialDeletedItems = [],
}: {
  artistId: string;
  slug: string;
  initialItems: BoardItem[];
  initialDeletedItems?: BoardItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [deletedItems, setDeletedItems] = useState(initialDeletedItems);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BoardItem | undefined>(undefined);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  function openAdd() {
    setEditing(undefined);
    setModalOpen(true);
  }

  function openEdit(item: BoardItem) {
    setEditing(item);
    setModalOpen(true);
  }

  function handleSaved(item: BoardItem) {
    const isNew = !editing;
    setItems((prev) => {
      const exists = prev.some((i) => i.id === item.id);
      return exists ? prev.map((i) => (i.id === item.id ? item : i)) : [item, ...prev];
    });
    if (isNew) {
      setJustAddedId(item.id);
      window.setTimeout(() => setJustAddedId(null), 400);
    }
  }

  function handleDelete(id: string) {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) setDeletedItems((d) => [{ ...item, deleted_at: new Date().toISOString() }, ...d]);
      return prev.filter((i) => i.id !== id);
    });
    void deleteBoardItem(id);
  }

  function handleRestore(id: string) {
    const item = deletedItems.find((i) => i.id === id);
    if (!item) return;
    setDeletedItems((prev) => prev.filter((i) => i.id !== id));
    setItems((prev) => [{ ...item, deleted_at: null }, ...prev]);
    void restoreBoardItem(id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={openAdd}
          className="self-start rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-black transition-all duration-150 ease-out hover:-translate-y-0.5 hover:brightness-110"
        >
          + New tactic
        </button>
        <RestoreDeletedPopover items={deletedItems} onRestore={handleRestore} />
      </div>

      {items.length === 0 ? (
        <div
          className="border-dashed p-12 text-center shadow-lg shadow-black/30 backdrop-blur-md"
          style={{ ...cardStyle, borderStyle: "dashed" }}
        >
          <p className="opacity-60" style={textStyle}>
            No tactics yet — add the first one above.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <TacticCard
              key={item.id}
              item={item}
              justAdded={item.id === justAddedId}
              onEdit={() => openEdit(item)}
              onDelete={() => handleDelete(item.id)}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <TacticFormModal
          artistId={artistId}
          slug={slug}
          item={editing}
          onClose={() => setModalOpen(false)}
          onSaved={(item) => handleSaved(item)}
        />
      )}
    </div>
  );
}

/** Wraps the board in its own PoofEffectProvider — same pattern as
 * IdeasBoard — so add/delete can each fire the particle-burst effect
 * without reaching outside this feature for a shared provider. */
export function TacticsBoard(props: {
  artistId: string;
  slug: string;
  initialItems: BoardItem[];
  initialDeletedItems?: BoardItem[];
}) {
  return (
    <PoofEffectProvider>
      <TacticsBoardInner {...props} />
    </PoofEffectProvider>
  );
}
