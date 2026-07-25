"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  createFolder,
  renameFolder,
  deleteFolder,
  moveArtist,
} from "@/app/builder/actions";
import { DeleteArtistButton } from "@/components/builder/DeleteArtistButton";

type ArtistLite = {
  id: string;
  name: string;
  slug: string;
  updated_at: string;
  folder_id: string | null;
  sort_order: number;
};
type FolderLite = { id: string; name: string; position: number };

const UNGROUPED = "__ungrouped__";

function groupByFolder(artists: ArtistLite[]): Record<string, ArtistLite[]> {
  const groups: Record<string, ArtistLite[]> = {};
  for (const artist of artists) {
    const key = artist.folder_id ?? UNGROUPED;
    (groups[key] ??= []).push(artist);
  }
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => a.sort_order - b.sort_order);
  }
  return groups;
}

export function ArtistsBoard({
  initialArtists,
  initialFolders,
}: {
  initialArtists: ArtistLite[];
  initialFolders: FolderLite[];
}) {
  const [artists, setArtists] = useState(initialArtists);
  const [folders, setFolders] = useState(
    [...initialFolders].sort((a, b) => a.position - b.position)
  );
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, startCreatingFolder] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = groupByFolder(artists);

  function applyDrop(destFolderId: string | null, destKey: string, beforeArtistId: string | null) {
    if (!dragId) return;
    const dragged = artists.find((a) => a.id === dragId);
    if (!dragged) return;

    const destList = (groups[destKey] ?? []).filter((a) => a.id !== dragId);
    const insertAt = beforeArtistId ? destList.findIndex((a) => a.id === beforeArtistId) : destList.length;
    destList.splice(insertAt < 0 ? destList.length : insertAt, 0, dragged);

    const reindexed = destList.map((a, i) => ({ ...a, folder_id: destFolderId, sort_order: i }));
    const reindexedIds = new Set(reindexed.map((a) => a.id));
    setArtists((prev) => [...prev.filter((a) => !reindexedIds.has(a.id)), ...reindexed]);
    setDragId(null);
    setDropZone(null);

    startCreatingFolder(async () => {
      const result = await moveArtist(
        dragId,
        destFolderId,
        reindexed.map((a) => a.id)
      );
      if (!result.ok) setError(result.error);
    });
  }

  function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setNewFolderName("");
    startCreatingFolder(async () => {
      const result = await createFolder(name);
      if (result.ok) {
        setFolders((prev) => [...prev, { id: result.id, name, position: prev.length }]);
      } else {
        setError(result.error);
      }
    });
  }

  function handleRenameFolder(folder: FolderLite) {
    const name = window.prompt("Rename folder", folder.name);
    if (!name || !name.trim() || name.trim() === folder.name) return;
    const trimmed = name.trim();
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, name: trimmed } : f)));
    startCreatingFolder(async () => {
      const result = await renameFolder(folder.id, trimmed);
      if (!result.ok) setError(result.error);
    });
  }

  function handleDeleteFolder(folder: FolderLite) {
    if (!window.confirm(`Delete folder "${folder.name}"? Artists inside move to Ungrouped.`)) return;
    setFolders((prev) => prev.filter((f) => f.id !== folder.id));
    setArtists((prev) => prev.map((a) => (a.folder_id === folder.id ? { ...a, folder_id: null } : a)));
    startCreatingFolder(async () => {
      const result = await deleteFolder(folder.id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <input
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
          placeholder="New folder name"
          className="w-56 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-violet-400 focus:outline-none"
        />
        <button
          type="button"
          disabled={isCreatingFolder || !newFolderName.trim()}
          onClick={handleCreateFolder}
          className="rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/5 disabled:opacity-40"
        >
          + Folder
        </button>
      </div>

      {folders.map((folder) => (
        <FolderSection
          key={folder.id}
          title={folder.name}
          artists={groups[folder.id] ?? []}
          isDropTarget={dropZone === folder.id}
          onRename={() => handleRenameFolder(folder)}
          onDelete={() => handleDeleteFolder(folder)}
          onDragStartCard={setDragId}
          onDragEnterZone={() => setDropZone(folder.id)}
          onDragLeaveZone={() => setDropZone((z) => (z === folder.id ? null : z))}
          onDropCard={(beforeId) => applyDrop(folder.id, folder.id, beforeId)}
        />
      ))}

      <FolderSection
        title="Ungrouped"
        artists={groups[UNGROUPED] ?? []}
        isDropTarget={dropZone === UNGROUPED}
        onDragStartCard={setDragId}
        onDragEnterZone={() => setDropZone(UNGROUPED)}
        onDragLeaveZone={() => setDropZone((z) => (z === UNGROUPED ? null : z))}
        onDropCard={(beforeId) => applyDrop(null, UNGROUPED, beforeId)}
      />
    </div>
  );
}

function FolderSection({
  title,
  artists,
  isDropTarget,
  onRename,
  onDelete,
  onDragStartCard,
  onDragEnterZone,
  onDragLeaveZone,
  onDropCard,
}: {
  title: string;
  artists: ArtistLite[];
  isDropTarget: boolean;
  onRename?: () => void;
  onDelete?: () => void;
  onDragStartCard: (id: string) => void;
  onDragEnterZone: () => void;
  onDragLeaveZone: () => void;
  onDropCard: (beforeArtistId: string | null) => void;
}) {
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={onDragEnterZone}
      onDragLeave={onDragLeaveZone}
      onDrop={(e) => {
        e.preventDefault();
        onDropCard(null);
      }}
      className={`rounded-xl border p-4 transition-colors ${
        isDropTarget ? "border-violet-400/60 bg-violet-500/5" : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          {title} <span className="text-white/30">({artists.length})</span>
        </h2>
        {(onRename || onDelete) && (
          <div className="flex gap-3 text-xs">
            {onRename && (
              <button type="button" onClick={onRename} className="text-white/40 hover:text-white">
                Rename
              </button>
            )}
            {onDelete && (
              <button type="button" onClick={onDelete} className="text-red-400/70 hover:text-red-400">
                Delete folder
              </button>
            )}
          </div>
        )}
      </div>

      {!artists.length ? (
        <p className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-white/30">
          Drag artist cards here
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {artists.map((artist) => (
            <div
              key={artist.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", artist.id);
                onDragStartCard(artist.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDropCard(artist.id);
              }}
              className="group cursor-grab rounded-lg border border-white/10 bg-white/[0.03] p-3 shadow-lg shadow-black/20 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-white/20 active:cursor-grabbing"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">{artist.name}</p>
                  <p className="truncate text-xs text-white/40">/s/{artist.slug}</p>
                </div>
                <DeleteArtistButton artistId={artist.id} artistName={artist.name} />
              </div>
              <div className="mt-3 flex gap-3 text-xs">
                <Link href={`/s/${artist.slug}`} className="text-white/50 hover:text-white hover:underline">
                  View site
                </Link>
                <Link
                  href={`/builder/artists/${artist.id}`}
                  className="font-medium text-violet-400 hover:underline"
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
