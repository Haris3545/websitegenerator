"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  createFolder,
  renameFolder,
  deleteFolder,
  moveArtist,
  deleteArtist,
} from "@/app/builder/actions";

type ArtistLite = {
  id: string;
  name: string;
  slug: string;
  updated_at: string;
  folder_id: string | null;
  sort_order: number;
  primary_color?: string | null;
};
type FolderLite = { id: string; name: string; position: number };

type View = { level: "root" } | { level: "folder"; folderId: string };

function FolderGlyph() {
  return (
    <div className="relative h-12 w-14">
      <div className="absolute left-0 top-1.5 h-3 w-7 rounded-t-md bg-amber-400 dark:bg-amber-500/80" />
      <div className="absolute inset-x-0 bottom-0 h-9 rounded-md rounded-tl-none border border-black/5 bg-amber-300 shadow-sm dark:border-white/10 dark:bg-amber-500/50" />
    </div>
  );
}

function SiteGlyph({ color }: { color: string }) {
  return (
    <div
      className="flex h-12 w-14 items-center justify-center rounded-xl shadow-sm"
      style={{ backgroundColor: color }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="opacity-90">
        <rect x="3" y="4" width="18" height="13" rx="1.5" stroke="white" strokeWidth="1.6" />
        <path d="M8 20h8M12 17v3" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </div>
  );
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
  const [view, setView] = useState<View>({ level: "root" });
  const [newFolderName, setNewFolderName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuFor) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuFor(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuFor]);

  function listFor(folderId: string | null) {
    return artists.filter((a) => a.folder_id === folderId).sort((a, b) => a.sort_order - b.sort_order);
  }

  function persistMove(artistId: string, destFolderId: string | null, beforeArtistId: string | null) {
    const dragged = artists.find((a) => a.id === artistId);
    if (!dragged) return;

    const destList = listFor(destFolderId).filter((a) => a.id !== artistId);
    const insertAt = beforeArtistId ? destList.findIndex((a) => a.id === beforeArtistId) : destList.length;
    destList.splice(insertAt < 0 ? destList.length : insertAt, 0, dragged);

    const reindexed = destList.map((a, i) => ({ ...a, folder_id: destFolderId, sort_order: i }));
    const reindexedIds = new Set(reindexed.map((a) => a.id));
    setArtists((prev) => [...prev.filter((a) => !reindexedIds.has(a.id)), ...reindexed]);

    startTransition(async () => {
      const result = await moveArtist(
        artistId,
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
    startTransition(async () => {
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
    startTransition(async () => {
      const result = await renameFolder(folder.id, trimmed);
      if (!result.ok) setError(result.error);
    });
  }

  function handleDeleteFolder(folder: FolderLite) {
    if (!window.confirm(`Delete folder "${folder.name}"? Sites inside move back to the desktop.`)) return;
    setFolders((prev) => prev.filter((f) => f.id !== folder.id));
    setArtists((prev) => prev.map((a) => (a.folder_id === folder.id ? { ...a, folder_id: null } : a)));
    setView({ level: "root" });
    startTransition(async () => {
      const result = await deleteFolder(folder.id);
      if (!result.ok) setError(result.error);
    });
  }

  const currentFolder = view.level === "folder" ? folders.find((f) => f.id === view.folderId) : null;
  const visibleArtists = view.level === "folder" ? listFor(view.folderId) : listFor(null);

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}

      {view.level === "root" ? (
        <div className="flex items-center gap-2">
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
            placeholder="New folder name"
            className="w-56 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm placeholder-neutral-400 focus:border-violet-400 focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder-white/30"
          />
          <button
            type="button"
            disabled={isPending || !newFolderName.trim()}
            onClick={handleCreateFolder}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/5"
          >
            + Folder
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={() => setDropTarget("__back__")}
          onDragLeave={() => setDropTarget((z) => (z === "__back__" ? null : z))}
          onDrop={(e) => {
            e.preventDefault();
            setDropTarget(null);
            if (dragId) persistMove(dragId, null, null);
            setDragId(null);
          }}
          className={`flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm transition-colors ${
            dropTarget === "__back__"
              ? "border-violet-400 bg-violet-500/5 text-violet-600 dark:text-violet-300"
              : "border-neutral-300 text-neutral-600 dark:border-white/15 dark:text-white/60"
          }`}
        >
          <button
            type="button"
            onClick={() => setView({ level: "root" })}
            className="font-medium hover:underline"
          >
            ← All artists
          </button>
          <span className="opacity-50">/ {currentFolder?.name ?? "Folder"}</span>
          <span className="ml-auto flex gap-3 text-xs">
            {currentFolder && (
              <>
                <button
                  type="button"
                  onClick={() => handleRenameFolder(currentFolder)}
                  className="hover:underline"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteFolder(currentFolder)}
                  className="text-red-600 hover:underline dark:text-red-400"
                >
                  Delete folder
                </button>
              </>
            )}
          </span>
          {dropTarget === "__back__" && <span className="text-xs">drop to remove from folder</span>}
        </div>
      )}

      <div className="flex flex-wrap gap-5">
        {view.level === "root" &&
          folders.map((folder) => {
            const count = listFor(folder.id).length;
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => setView({ level: "folder", folderId: folder.id })}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => setDropTarget(folder.id)}
                onDragLeave={() => setDropTarget((z) => (z === folder.id ? null : z))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropTarget(null);
                  if (dragId) persistMove(dragId, folder.id, null);
                  setDragId(null);
                }}
                className={`flex w-24 flex-col items-center gap-1.5 rounded-lg p-2 text-center transition-colors ${
                  dropTarget === folder.id ? "bg-violet-500/10 ring-2 ring-violet-400" : "hover:bg-black/[0.03] dark:hover:bg-white/5"
                }`}
              >
                <FolderGlyph />
                <span className="w-full truncate text-xs font-medium text-neutral-800 dark:text-white/90">
                  {folder.name}
                </span>
                <span className="text-[10px] text-neutral-400 dark:text-white/40">
                  {count} site{count === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}

        {visibleArtists.map((artist) => (
          <div key={artist.id} className="relative">
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", artist.id);
                setDragId(artist.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDropTarget(artist.id);
              }}
              onDragLeave={() => setDropTarget((z) => (z === artist.id ? null : z))}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDropTarget(null);
                if (dragId) persistMove(dragId, view.level === "folder" ? view.folderId : null, artist.id);
                setDragId(null);
              }}
              onClick={() => setMenuFor((m) => (m === artist.id ? null : artist.id))}
              className={`flex w-24 cursor-pointer flex-col items-center gap-1.5 rounded-lg p-2 text-center transition-colors ${
                dropTarget === artist.id ? "bg-violet-500/10 ring-2 ring-violet-400" : "hover:bg-black/[0.03] dark:hover:bg-white/5"
              }`}
            >
              <SiteGlyph color={artist.primary_color || "#7c3aed"} />
              <span className="w-full truncate text-xs font-medium text-neutral-800 dark:text-white/90">
                {artist.name}
              </span>
              <span className="w-full truncate text-[10px] text-neutral-400 dark:text-white/40">
                /s/{artist.slug}
              </span>
            </div>

            {menuFor === artist.id && (
              <div
                ref={menuRef}
                className="absolute left-1/2 top-full z-30 mt-1 w-40 -translate-x-1/2 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl dark:border-white/10 dark:bg-neutral-900"
              >
                <Link
                  href={`/s/${artist.slug}`}
                  className="block px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 dark:text-white/80 dark:hover:bg-white/5"
                >
                  View site
                </Link>
                <Link
                  href={`/builder/artists/${artist.id}`}
                  className="block px-3 py-2 text-left text-sm font-medium text-violet-600 hover:bg-neutral-50 dark:text-violet-400 dark:hover:bg-white/5"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMenuFor(null);
                    if (
                      !window.confirm(
                        `Delete "${artist.name}" for good? This removes its dashboard, all cached data, and (if published) its standalone site. This can't be undone.`
                      )
                    )
                      return;
                    setArtists((prev) => prev.filter((a) => a.id !== artist.id));
                    startTransition(async () => {
                      const result = await deleteArtist(artist.id);
                      if (!result.ok) setError(result.error);
                    });
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}

        {view.level === "folder" && !visibleArtists.length && (
          <p className="text-sm text-neutral-400 dark:text-white/30">
            Empty — drag a site here from the desktop.
          </p>
        )}
      </div>
    </div>
  );
}
