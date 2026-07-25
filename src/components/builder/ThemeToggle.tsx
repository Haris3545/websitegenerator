"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "builder-theme";
const CHANGE_EVENT = "builder-theme-change";

// useSyncExternalStore is the React-sanctioned way to read a value that can
// differ between server and client render (here, whether the inline script
// in the root layout already added the `dark` class before hydration) —
// it renders the server snapshot through hydration, then swaps to the real
// client value right after, with no mismatch warning and no setState-in-
// effect. The toggle button is the only thing that ever changes the class,
// so it just dispatches its own event to notify this hook to re-read it.
function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}
function getSnapshot() {
  return document.documentElement.classList.contains("dark");
}
function getServerSnapshot() {
  return false;
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="fixed bottom-5 right-5 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white text-lg text-neutral-600 shadow-lg transition-colors hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-900 dark:text-white/70 dark:hover:bg-neutral-800"
    >
      {dark ? "☀" : "☾"}
    </button>
  );
}
