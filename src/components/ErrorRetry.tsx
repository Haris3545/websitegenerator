"use client";

import { useEffect, useState } from "react";

const MAX_AUTO_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

/** Next's error boundary UI for a route segment — shared by the site shell,
 * the builder, and the root layout. Automatically retries via `reset()` a
 * few times (most errors here are transient: a flaky external API call, a
 * cold Supabase connection) before giving up and leaving only the manual
 * button, so a real recurring error doesn't hammer the server forever. Each
 * mount is a fresh instance (Next remounts this component per error), so
 * the retry count is tracked in sessionStorage rather than component state
 * to survive across those remounts. */
export function ErrorRetry({
  error,
  reset,
  storageKey,
  dark = false,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  storageKey: string;
  /** Forces a full-viewport dark background — for boundaries that might
   * catch an error before any themed layout (e.g. an artist's own dark
   * dashboard shell) has had a chance to render around them, leaving
   * nothing but the root layout's plain background otherwise. */
  dark?: boolean;
}) {
  const [attempt] = useState(() => {
    if (typeof window === "undefined") return 0;
    const prev = Number(window.sessionStorage.getItem(storageKey) ?? "0");
    const next = prev + 1;
    window.sessionStorage.setItem(storageKey, String(next));
    return next;
  });
  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    if (attempt > MAX_AUTO_RETRIES) return;
    const timer = window.setTimeout(() => reset(), RETRY_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset is a fresh function identity every render (from Next's error boundary); depending on it would just restart this timer every render instead of once per attempt
  }, [attempt]);

  function retryNow() {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(storageKey);
    reset();
  }

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 p-6 text-center ${
        dark ? "min-h-screen bg-neutral-950 text-white" : "min-h-[60vh] text-neutral-800 dark:text-white"
      }`}
    >
      <p className={dark ? "text-sm text-white/50" : "text-sm text-neutral-500 dark:text-white/50"}>
        Something hiccuped loading this page.
      </p>
      <p className="text-lg font-semibold">
        {attempt <= MAX_AUTO_RETRIES ? "Refreshing to view sites…" : "Refresh to view sites"}
      </p>
      <button
        type="button"
        onClick={retryNow}
        className="mt-2 rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition-transform [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-0.5"
      >
        Refresh now
      </button>
    </div>
  );
}
