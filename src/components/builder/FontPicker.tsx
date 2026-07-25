"use client";

import { useEffect, useMemo, useState } from "react";
import { googleFontsCssUrl } from "@/lib/fonts";

export function FontPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (font: string) => void;
}) {
  const [fonts, setFonts] = useState<string[]>([value]);
  const [query, setQuery] = useState("");

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

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-white/50">
        Font
      </span>
      <input
        type="text"
        placeholder="Search fonts..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder-neutral-400 focus:border-builder-accent focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder-white/30"
      />
      <select
        size={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-neutral-300 bg-white dark:border-white/15 dark:bg-white/5 dark:text-white dark:[&>option]:bg-neutral-900"
      >
        {filtered.map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </select>
      <link rel="stylesheet" href={googleFontsCssUrl(value)} />
      <p style={{ fontFamily: value }} className="mt-1 text-base text-neutral-700 dark:text-white/80">
        {value} — The quick brown fox jumps over the lazy dog
      </p>
    </div>
  );
}
