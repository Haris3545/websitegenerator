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
    <div className="flex flex-col gap-1 text-sm">
      <span>Font</span>
      <input
        type="text"
        placeholder="Search fonts..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="rounded border border-neutral-300 px-2 py-1"
      />
      <select
        size={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-neutral-300"
      >
        {filtered.map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </select>
      <link rel="stylesheet" href={googleFontsCssUrl(value)} />
      <p style={{ fontFamily: value }} className="mt-1 text-base">
        {value} — The quick brown fox jumps over the lazy dog
      </p>
    </div>
  );
}
