"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { googleFontsCssUrl } from "@/lib/fonts";

/** A single-field font picker: closed, it's just a button showing the
 * current font (rendered in that font). Opening it unfurls a dropdown with
 * a search box and the filtered list underneath — clicking a font, or
 * arrowing up/down through the list, applies it immediately (so whatever
 * else on the page previews the font, e.g. the password page preview,
 * updates live as you go) without closing the dropdown, so cycling through
 * several candidates to see which one "feels right" doesn't mean reopening
 * it each time. Enter just closes the dropdown on whatever's already
 * showing. It only closes on a deliberate click outside, Escape, Enter, or
 * the Done button.
 *
 * The dropdown expands in normal document flow (a CSS grid-rows 0fr->1fr
 * animation) rather than floating as an absolutely-positioned overlay —
 * floating would cover whatever sits right below it in the form (the
 * password-page preview, which is exactly what someone cycling through
 * fonts wants to keep watching), so it pushes that content down instead. */
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
  const [highlighted, setHighlighted] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

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
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[highlighted]?.scrollIntoView({ block: "nearest" });
  }, [open, highlighted]);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(highlighted + 1, filtered.length - 1);
      setHighlighted(next);
      const font = filtered[next];
      if (font) onChange(font);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(highlighted - 1, 0);
      setHighlighted(next);
      const font = filtered[next];
      if (font) onChange(font);
    } else if (e.key === "Enter") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-white/50">
        Font
      </span>
      <link rel="stylesheet" href={googleFontsCssUrl(value)} />

      <button
        type="button"
        onClick={() => {
          setOpen((o) => {
            const next = !o;
            // Start the highlight on whatever's currently applied when
            // opening, so arrowing down once moves to the next candidate
            // rather than jumping to the top of an unrelated list.
            if (next) {
              const current = filtered.indexOf(value);
              setHighlighted(current >= 0 ? current : 0);
            }
            return next;
          });
        }}
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

      {/* The grid-rows 0fr/1fr animation is what makes an *auto*-height
          panel animate open/closed smoothly (a plain height/max-height
          transition can't animate to "however tall the content turns out to
          be") while still taking up real space in the layout instead of
          floating over whatever's below it. */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div
            className={`mt-2 rounded-xl border border-neutral-200 bg-white shadow-sm transition-opacity duration-150 dark:border-white/10 dark:bg-neutral-900 ${
              open ? "opacity-100 delay-75" : "opacity-0"
            }`}
          >
            <div className="flex flex-col gap-2 border-b border-neutral-200 p-2.5 dark:border-white/10">
              <input
                ref={searchRef}
                type="text"
                placeholder="Search fonts…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlighted(0);
                }}
                onKeyDown={handleSearchKeyDown}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm placeholder-neutral-400 focus:border-builder-accent focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-white/30"
              />
            </div>

            <ul className="custom-scrollbar max-h-56 overflow-y-auto py-1">
              {filtered.map((font, i) => (
                <li key={font}>
                  <button
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    type="button"
                    onClick={() => {
                      onChange(font);
                      setHighlighted(i);
                    }}
                    onMouseEnter={() => setHighlighted(i)}
                    className={`flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-sm transition-colors ${
                      i === highlighted ? "bg-neutral-100 dark:bg-white/5" : ""
                    } ${font === value ? "text-builder-accent" : "text-neutral-700 dark:text-white/80"}`}
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
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden text-[10px] text-neutral-400 dark:text-white/30 sm:inline">↑↓ to preview, Enter to close</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="shrink-0 rounded-full bg-builder-accent px-3.5 py-1.5 text-xs font-semibold text-black transition-transform [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-0.5"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
