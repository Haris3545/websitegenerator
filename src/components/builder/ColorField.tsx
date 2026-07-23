"use client";

import { useState } from "react";
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

  return (
    <div className="relative flex flex-col gap-1 text-sm">
      <span>{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="h-8 w-8 rounded border border-neutral-300"
          style={{ backgroundColor: value }}
          aria-label={`Pick ${label}`}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 rounded border border-neutral-300 px-2 py-1 font-mono text-xs"
        />
      </div>
      {open && (
        <div className="absolute top-full z-10 mt-1">
          <HexColorPicker color={value} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
