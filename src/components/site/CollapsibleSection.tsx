"use client";

import { useState, type ReactNode } from "react";

/** Generic disclosure used to tuck the Calendar tab's month-grid view
 * underneath the Campaign timeline, closed by default — same
 * grid-template-rows 0fr<->1fr unfurl technique as FontPicker's dropdown
 * and CampaignTimeline's Add popover, just vertical and full-width. */
export function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left text-sm font-semibold uppercase tracking-wide text-white/70 transition-colors hover:text-white"
      >
        <span className="h-3 w-1 bg-[var(--accent)]" />
        {title}
        <svg
          className={`ml-auto h-3.5 w-3.5 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            open ? "rotate-180" : ""
          }`}
          viewBox="0 0 12 12"
          fill="none"
        >
          <path
            d="M2.5 4.5L6 8L9.5 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="pt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
