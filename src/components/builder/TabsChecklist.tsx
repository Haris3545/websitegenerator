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
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-white/50">
        Tabs
      </span>
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-neutral-300 bg-white p-3 dark:border-white/15 dark:bg-white/5 sm:grid-cols-3">
        {TABS.map((tab) => (
          <label key={tab.key} className="flex items-center gap-2 text-neutral-700 dark:text-white/80">
            <input
              type="checkbox"
              checked={tab.key === "dashboard" || value.includes(tab.key)}
              disabled={tab.key === "dashboard"}
              onChange={() => toggle(tab.key)}
              className="accent-builder-accent"
            />
            {tab.label}
          </label>
        ))}
      </div>
    </div>
  );
}
