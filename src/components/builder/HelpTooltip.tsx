"use client";

import { useState } from "react";

/** A small "?" affordance that reveals explanatory text on hover/focus
 * instead of it sitting on the page permanently — the builder form used to
 * show every field's full explanation at all times regardless of whether
 * anyone needed it, which read as far more text than the form actually is.
 * Keyboard-focusable (not just hover) so it's still reachable without a
 * mouse. */
export function HelpTooltip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => e.preventDefault()}
        aria-label="More info"
        className="flex h-4 w-4 items-center justify-center rounded-full border border-neutral-300 text-[10px] font-semibold leading-none text-neutral-400 transition-colors hover:border-builder-accent hover:text-builder-accent dark:border-white/20 dark:text-white/40"
      >
        ?
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-56 origin-bottom -translate-x-1/2 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-[11px] font-normal normal-case leading-snug text-neutral-600 shadow-lg transition-[opacity,transform] duration-[125ms] ease-out dark:border-white/15 dark:bg-neutral-900 dark:text-white/70 ${
          open ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        {children}
      </span>
    </span>
  );
}
