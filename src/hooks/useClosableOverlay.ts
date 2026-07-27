"use client";

import { useState } from "react";

const DEFAULT_DURATION_MS = 220;

/** Lets a modal/overlay play an exit animation before it actually unmounts,
 * instead of vanishing the instant close is requested. Swap the "in" CSS
 * class for the "out" one when `closing` flips true, and call
 * requestClose() from every dismiss path (backdrop click, X button, Cancel,
 * successful submit) instead of the raw onClose prop directly. */
export function useClosableOverlay(onClose: () => void, durationMs = DEFAULT_DURATION_MS) {
  const [closing, setClosing] = useState(false);

  function requestClose() {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, durationMs);
  }

  return { closing, requestClose };
}
