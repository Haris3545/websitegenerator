"use client";

import { useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Closes on a click anywhere outside, or Escape — standard popover
  // behavior so it doesn't just sit open until you happen to click the
  // swatch again.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-white/50">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="h-8 w-8 rounded-lg border border-neutral-300 shadow-inner transition-transform duration-150 ease-out active:scale-[0.97] dark:border-white/15"
          style={{ backgroundColor: value }}
          aria-label={`Pick ${label}`}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 font-mono text-xs focus:border-builder-accent focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white"
        />
      </div>
      {open && (
        // Stays open until an outside click or Escape (see the effect
        // above) — closing on every pointerup here meant the popover slammed
        // shut after the very first drag release, before you could also
        // touch the hue strip or fine-tune further.
        <div className="animate-dropdown-unfurl absolute top-full z-10 mt-1 origin-top-left">
          <HexColorPicker color={value} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
