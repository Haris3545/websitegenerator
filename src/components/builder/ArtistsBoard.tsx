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
  background_image_url?: string | null;
};
type FolderLite = { id: string; name: string; position: number };

type View = { level: "root" } | { level: "folder"; folderId: string };

// Grabbing an icon doesn't start a drag until the pointer has actually
// moved this many px — below that, a pointerup is a click (opens the
// menu), same threshold pattern used for the theme editor's background
// drag and the gate preview's reposition drag elsewhere in the builder.
const DRAG_MOVE_THRESHOLD = 5;
// The sway is a rotation driven by the pointer's own recent horizontal
// speed, eased toward its target via a CSS transition rather than
// integrated frame-by-frame — an approximation of a swinging thumbnail,
// not an actual spring/physics simulation.
const MAX_SWAY_DEG = 16;
const SWAY_SENSITIVITY = 45; // deg per (px/ms) of pointer speed

function FolderGlyph() {
  return (
    <div className="relative h-12 w-14">
      <div className="absolute left-0 top-1.5 h-3 w-7 rounded-t-md bg-amber-400 dark:bg-amber-500/80" />
      <div className="absolute inset-x-0 bottom-0 h-9 rounded-md rounded-tl-none border border-black/5 bg-amber-300 shadow-sm dark:border-white/10 dark:bg-amber-500/50" />
    </div>
  );
}

/** Shows the artist's own uploaded background image (the same asset the
 * real dashboard renders behind everything — see background_image_url in
 * the (app) layout), cropped/scaled to fit this small icon, falling back to
 * a plain tinted glyph if there's no image yet or it fails to load (e.g. a
 * video background — an <img> tag can't render those, which is an
 * acceptable icon-only degradation). No screenshot service involved: this
 * used to depend on a third-party renderer (thum.io, then WordPress
 * mShots) capturing a purpose-built preview page, which repeatedly proved
 * unreliable — using an asset already sitting in Storage is instant and
 * can never come back blank. */
function SiteGlyph({
  color,
  imageUrl,
  className = "h-10 w-16",
}: {
  color: string;
  imageUrl?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (imageUrl && !failed) {
    return (
      <div className={`overflow-hidden rounded-xl border border-black/10 bg-neutral-800 shadow-sm dark:border-white/10 ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-xl shadow-sm ${className}`}
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
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The floating dragged thumbnail — null whenever nothing's being
  // dragged. Position/rotation update on every pointermove; the id is
  // what actually drives which real icon renders dimmed in its place.
  const [draggedArtist, setDraggedArtist] = useState<ArtistLite | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dragRotation, setDragRotation] = useState(0);
  const [dragGrab, setDragGrab] = useState({ dx: 0, dy: 0 });

  const dragRef = useRef<{
    artist: ArtistLite;
    startX: number;
    startY: number;
    grabDx: number;
    grabDy: number;
    moved: boolean;
    lastX: number;
    lastT: number;
    startRect: DOMRect;
  } | null>(null);
  const dropTargetRef = useRef<string | null>(null);
  const menuForRef = useRef<string | null>(null);
  const persistMoveRef = useRef<(artistId: string, destFolderId: string | null, beforeArtistId: string | null) => void>(
    () => {}
  );
  useEffect(() => {
    menuForRef.current = menuFor;
  }, [menuFor]);

  // The menu for every artist stays mounted at all times (see
  // data-artist-menu below) and animates purely via CSS classes, so it can
  // ease in AND ease back out on close — an unmount-on-close approach would
  // only ever animate the open direction. Outside-click detection checks
  // against the currently-open artist's own wrapper via that data
  // attribute rather than a single ref, since multiple menu wrappers exist
  // in the DOM simultaneously.
  useEffect(() => {
    if (!menuFor) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest(`[data-artist-menu="${menuFor}"]`)) setMenuFor(null);
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
  useEffect(() => {
    persistMoveRef.current = persistMove;
  });

  function openMenuForRect(artistId: string, rect: DOMRect) {
    // Fixed (viewport-relative) positioning, clamped to stay fully
    // on-screen — an absolute-positioned menu centered on the icon with no
    // awareness of the viewport edge would get clipped/pushed off-screen
    // for an icon near the left/right edge on a narrow window.
    const menuWidth = 160;
    const margin = 12;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - menuWidth / 2, margin),
      window.innerWidth - menuWidth - margin
    );
    setMenuPos({ top: rect.bottom + 6, left });
    setMenuFor(artistId);
  }

  // Global pointermove/pointerup so the drag keeps tracking even once the
  // cursor leaves the original icon's bounds — kept to an empty dependency
  // array (persistMove/artists accessed only via refs or DOM data
  // attributes) so it subscribes exactly once rather than on every
  // dropTarget/artists change during a drag.
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const ds = dragRef.current;
      if (!ds) return;
      const dx = e.clientX - ds.startX;
      const dy = e.clientY - ds.startY;

      if (!ds.moved) {
        if (Math.hypot(dx, dy) < DRAG_MOVE_THRESHOLD) return;
        ds.moved = true;
        setDraggedArtist(ds.artist);
        setDragGrab({ dx: ds.grabDx, dy: ds.grabDy });
      }

      const now = performance.now();
      const dt = Math.max(1, now - ds.lastT);
      const vx = (e.clientX - ds.lastX) / dt;
      ds.lastX = e.clientX;
      ds.lastT = now;

      const targetRotation = Math.max(-MAX_SWAY_DEG, Math.min(MAX_SWAY_DEG, vx * SWAY_SENSITIVITY));
      setDragRotation(targetRotation);
      setDragPos({ x: e.clientX, y: e.clientY });

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const zone = el?.closest<HTMLElement>("[data-drop-zone]")?.dataset.dropZone ?? null;
      const resolved = zone && zone !== `artist:${ds.artist.id}` ? zone : null;
      dropTargetRef.current = resolved;
      setDropTarget(resolved);
    }

    function onUp() {
      const ds = dragRef.current;
      dragRef.current = null;
      if (!ds) return;

      if (!ds.moved) {
        if (menuForRef.current === ds.artist.id) {
          setMenuFor(null);
        } else {
          openMenuForRect(ds.artist.id, ds.startRect);
        }
        return;
      }

      const zone = dropTargetRef.current;
      if (zone === "back") {
        persistMoveRef.current(ds.artist.id, null, null);
      } else if (zone?.startsWith("folder:")) {
        persistMoveRef.current(ds.artist.id, zone.slice("folder:".length), null);
      } else if (zone?.startsWith("artist:")) {
        const targetId = zone.slice("artist:".length);
        const targetEl = document.querySelector<HTMLElement>(`[data-drop-zone="artist:${targetId}"]`);
        const targetFolder = targetEl?.dataset.artistFolder || null;
        persistMoveRef.current(ds.artist.id, targetFolder, targetId);
      }

      setDraggedArtist(null);
      setDragRotation(0);
      setDropTarget(null);
      dropTargetRef.current = null;
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  function makeIconPointerDown(artist: ArtistLite) {
    return (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      dragRef.current = {
        artist,
        startX: e.clientX,
        startY: e.clientY,
        grabDx: e.clientX - rect.left,
        grabDy: e.clientY - rect.top,
        moved: false,
        lastX: e.clientX,
        lastT: performance.now(),
        startRect: rect,
      };
    };
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
            className="w-56 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm placeholder-neutral-400 focus:border-builder-accent focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder-white/30"
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
          data-drop-zone="back"
          className={`flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm transition-colors ${
            dropTarget === "back"
              ? "border-builder-accent bg-builder-accent/5 text-amber-700 dark:text-amber-300"
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
          {dropTarget === "back" && <span className="text-xs">drop to remove from folder</span>}
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
                data-drop-zone={`folder:${folder.id}`}
                onClick={() => setView({ level: "folder", folderId: folder.id })}
                className={`flex w-24 flex-col items-center gap-1.5 rounded-lg p-2 text-center transition-colors ${
                  dropTarget === `folder:${folder.id}` ? "bg-builder-accent/10 ring-2 ring-builder-accent" : "hover:bg-black/[0.03] dark:hover:bg-white/5"
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
          <div key={artist.id} className="relative" data-artist-menu={artist.id}>
            <div
              data-drop-zone={`artist:${artist.id}`}
              data-artist-folder={artist.folder_id ?? ""}
              onPointerDown={makeIconPointerDown(artist)}
              className={`flex w-24 cursor-grab touch-none select-none flex-col items-center gap-1.5 rounded-lg p-2 text-center transition-colors active:cursor-grabbing ${
                dropTarget === `artist:${artist.id}` ? "bg-builder-accent/10 ring-2 ring-builder-accent" : "hover:bg-black/[0.03] dark:hover:bg-white/5"
              } ${draggedArtist?.id === artist.id ? "opacity-30" : ""}`}
            >
              <SiteGlyph
                key={artist.background_image_url ?? "none"}
                color={artist.primary_color || "#eab308"}
                imageUrl={artist.background_image_url ?? undefined}
              />
              <span className="w-full truncate text-xs font-medium text-neutral-800 dark:text-white/90">
                {artist.name}
              </span>
              <span className="w-full truncate text-[10px] text-neutral-400 dark:text-white/40">
                /s/{artist.slug}
              </span>
            </div>

            <div
              style={menuFor === artist.id && menuPos ? { top: menuPos.top, left: menuPos.left } : undefined}
              className={`fixed z-30 w-40 origin-top overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl transition-all duration-150 ease-out dark:border-white/10 dark:bg-neutral-900 ${
                menuFor === artist.id
                  ? "scale-100 opacity-100"
                  : "pointer-events-none scale-95 opacity-0"
              }`}
            >
              <Link
                href={`/s/${artist.slug}`}
                className="block px-3 py-2 text-left text-sm font-medium hover:bg-neutral-50 dark:hover:bg-white/5"
                style={{ color: "#75ba75" }}
              >
                View site
              </Link>
              <Link
                href={`/builder/artists/${artist.id}`}
                className="block px-3 py-2 text-left text-sm font-medium text-amber-700 hover:bg-neutral-50 dark:text-amber-400 dark:hover:bg-white/5"
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
          </div>
        ))}

        {view.level === "folder" && !visibleArtists.length && (
          <p className="text-sm text-neutral-400 dark:text-white/30">
            Empty — drag a site here from the desktop.
          </p>
        )}
      </div>

      {draggedArtist && (
        <div
          className="pointer-events-none fixed z-50"
          style={{
            left: dragPos.x - dragGrab.dx,
            top: dragPos.y - dragGrab.dy,
            transform: `rotate(${dragRotation}deg) scale(1.08)`,
            transition: "transform 150ms cubic-bezier(0.34, 1.2, 0.64, 1)",
          }}
        >
          <SiteGlyph
            color={draggedArtist.primary_color || "#eab308"}
            imageUrl={draggedArtist.background_image_url ?? undefined}
            className="h-14 w-24 shadow-2xl shadow-black/40"
          />
        </div>
      )}
    </div>
  );
}
