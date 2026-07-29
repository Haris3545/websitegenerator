"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { googleFontsCssUrl } from "@/lib/fonts";

/** A single-field font picker: closed, it's just a button showing the
 * current font (rendered in that font). Opening it unfurls a dropdown with
 * a search box and the filtered list underneath — clicking any font in the
 * list applies it immediately (so whatever else on the page previews the
 * font, e.g. the password page preview, updates live as you go) without
 * closing the dropdown, so cycling through several candidates to see which
 * one "feels right" doesn't mean reopening it each time. It only closes on
 * a deliberate click outside, Escape, or the Done button. */
export function FontPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (font: string) => void;
}) {
  const [fonts, setFonts] = useState<string[]>([value]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/fonts")
      .then((r) => r.json())
      .then((data: { fonts: string[] }) => setFonts(data.fonts))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? fonts.filter((f) => f.toLowerCase().includes(q)) : fonts;
    return list.slice(0, 50);
  }, [fonts, query]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
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
        Font
      </span>
      <link rel="stylesheet" href={googleFontsCssUrl(value)} />

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-left transition-shadow duration-150 focus:border-builder-accent focus:shadow-[0_0_0_3px_rgba(255,201,49,0.2)] focus:outline-none dark:border-white/10 dark:bg-white/5"
      >
        <span style={{ fontFamily: value }} className="truncate text-neutral-900 dark:text-white">
          {value}
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-200 dark:text-white/40 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          <path d="m5.5 7.5 4.5 5 4.5-5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Always mounted (not conditionally rendered) so the closing
          transition can actually play — pointer-events and opacity/scale
          both gate on `open`, transform-origin top so it reads as
          unfurling downward from the field rather than just fading in. */}
      <div
        className={`absolute left-0 right-0 top-full z-30 mt-2 origin-top overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl transition-all duration-200 ease-out dark:border-white/10 dark:bg-neutral-900 ${
          open ? "scale-y-100 opacity-100" : "pointer-events-none scale-y-95 opacity-0"
        }`}
      >
        <div className="flex flex-col gap-2 border-b border-neutral-200 p-2.5 dark:border-white/10">
          <input
            ref={searchRef}
            type="text"
            placeholder="Search fonts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm placeholder-neutral-400 focus:border-builder-accent focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-white/30"
          />
        </div>

        <ul className="custom-scrollbar max-h-56 overflow-y-auto py-1">
          {filtered.map((font) => (
            <li key={font}>
              <button
                type="button"
                onClick={() => onChange(font)}
                className={`flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-sm transition-colors hover:bg-neutral-100 dark:hover:bg-white/5 ${
                  font === value ? "text-builder-accent" : "text-neutral-700 dark:text-white/80"
                }`}
              >
                <span className="truncate">{font}</span>
                {font === value && (
                  <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 shrink-0" aria-hidden>
                    <path d="M4 10.5 8 14l8-8" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3.5 py-3 text-sm text-neutral-400 dark:text-white/40">No fonts match.</li>
          )}
        </ul>

        <div className="flex items-center justify-between gap-3 border-t border-neutral-200 p-2.5 dark:border-white/10">
          <p style={{ fontFamily: value }} className="min-w-0 truncate text-sm text-neutral-600 dark:text-white/70">
            The quick brown fox jumps
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="shrink-0 rounded-full bg-builder-accent px-3.5 py-1.5 text-xs font-semibold text-black transition-transform hover:-translate-y-0.5"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
