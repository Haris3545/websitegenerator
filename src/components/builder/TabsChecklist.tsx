"use client";

import { TABS } from "@/lib/tabs";
import type { TabKey } from "@/lib/database.types";

export function TabsChecklist({
  value,
  onChange,
}: {
  value: TabKey[];
  onChange: (tabs: TabKey[]) => void;
}) {
  function toggle(tab: TabKey) {
    if (tab === "dashboard") return; // always on
    onChange(value.includes(tab) ? value.filter((t) => t !== tab) : [...value, tab]);
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span>Tabs</span>
      <div className="grid grid-cols-3 gap-2 rounded border border-neutral-200 p-3">
        {TABS.map((tab) => (
          <label key={tab.key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={tab.key === "dashboard" || value.includes(tab.key)}
              disabled={tab.key === "dashboard"}
              onChange={() => toggle(tab.key)}
            />
            {tab.label}
          </label>
        ))}
      </div>
    </div>
  );
}
