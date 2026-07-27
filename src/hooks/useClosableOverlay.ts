"use client";

import { useState } from "react";

const DEFAULT_DURATION_MS = 220;

/** Lets a modal/overlay play an exit animation before it actually unmounts,
 * instead of vanishing the instant close is requested. Swap the "in" CSS
 * class for the "out" one when `closing` flips true, and call
 * requestClose() from every dismiss path (backdrop click, X button, Cancel,
 * successful submit) instead of the raw onClose prop directly.
 *
 * `closing` resets back to false once onClose actually fires — this matters
 * whenever the caller keeps using the *same* hook instance across repeated
 * open/close cycles (e.g. a persistently-mounted parent that conditionally
 * renders the overlay's JSX inline, rather than mounting a whole separate
 * component per open). Without the reset, closing stayed stuck true
 * forever after the first close, so the next time the overlay opened it
 * would immediately render with the exit animation class instead of the
 * entrance one — looking broken/glitchy on the second open. Components that
 * mount a fresh child (with its own useClosableOverlay call) each time
 * never hit this, since a fresh useState(false) is just as reliable, but
 * the reset is harmless for them too. */
export function useClosableOverlay(onClose: () => void, durationMs = DEFAULT_DURATION_MS) {
  const [closing, setClosing] = useState(false);

  function requestClose() {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      onClose();
      setClosing(false);
    }, durationMs);
  }

  return { closing, requestClose };
}
