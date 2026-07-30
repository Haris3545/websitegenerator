"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}
function getSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function getServerSnapshot() {
  return false;
}

/** Reactive prefers-reduced-motion read — for any component driving motion
 * via inline styles/JS (drag, gesture, canvas) where the CSS media query in
 * globals.css can't reach. Keep opacity/color transitions when branching on
 * this; only drop movement/transform. */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
