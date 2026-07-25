"use client";

import { createContext, useContext, useState } from "react";

const EditModeContext = createContext<{
  editMode: boolean;
  toggle: () => void;
  editingAllowed: boolean;
} | null>(null);

/** Wraps the whole site layout so the edit-mode toggle (see SiteFooter)
 * persists across tab navigation instead of resetting on every page —
 * living in the layout rather than a page means it isn't remounted when
 * navigating between sibling tabs.
 *
 * editingAllowed is false on a published standalone deployment (see
 * publish.ts, which sets PINNED_ARTIST_SLUG on that Vercel project) — a
 * standalone site is meant to be a clean, final artifact for whoever it's
 * shared with, not something they can right-click into and start editing. */
export function EditModeProvider({
  children,
  editingAllowed,
}: {
  children: React.ReactNode;
  editingAllowed: boolean;
}) {
  const [editMode, setEditMode] = useState(false);
  return (
    <EditModeContext.Provider
      value={{
        editMode: editingAllowed && editMode,
        toggle: () => setEditMode((v) => !v),
        editingAllowed,
      }}
    >
      {children}
    </EditModeContext.Provider>
  );
}

export function useEditMode() {
  const ctx = useContext(EditModeContext);
  if (!ctx) throw new Error("useEditMode must be used within EditModeProvider");
  return ctx;
}
