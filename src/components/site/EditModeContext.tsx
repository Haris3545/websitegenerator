"use client";

import { createContext, useContext, useState } from "react";

const EditModeContext = createContext<{ editMode: boolean; toggle: () => void } | null>(null);

/** Wraps the whole site layout so the edit-mode toggle (see SiteFooter)
 * persists across tab navigation instead of resetting on every page —
 * living in the layout rather than a page means it isn't remounted when
 * navigating between sibling tabs. */
export function EditModeProvider({ children }: { children: React.ReactNode }) {
  const [editMode, setEditMode] = useState(false);
  return (
    <EditModeContext.Provider value={{ editMode, toggle: () => setEditMode((v) => !v) }}>
      {children}
    </EditModeContext.Provider>
  );
}

export function useEditMode() {
  const ctx = useContext(EditModeContext);
  if (!ctx) throw new Error("useEditMode must be used within EditModeProvider");
  return ctx;
}
