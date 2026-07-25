"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS_BY_KEY, orderedEnabledTabs } from "@/lib/tabs";
import { useEditMode } from "@/components/site/EditModeContext";
import { updateTabOrder } from "@/app/s/[slug]/actions";
import type { TabKey } from "@/lib/database.types";

export function NavPills({
  slug,
  artistId,
  enabledTabs,
}: {
  slug: string;
  artistId: string;
  enabledTabs: TabKey[];
}) {
  const pathname = usePathname();
  const base = `/s/${slug}`;
  const { editMode } = useEditMode();
  const [, startTransition] = useTransition();

  const [tabs, setTabs] = useState<TabKey[]>(() => orderedEnabledTabs(enabledTabs));
  const [dragKey, setDragKey] = useState<TabKey | null>(null);

  function persist(next: TabKey[]) {
    setTabs(next);
    startTransition(() => {
      updateTabOrder(artistId, next.filter((k) => k !== "dashboard"));
    });
  }

  function moveTo(beforeKey: TabKey | null) {
    if (!dragKey || dragKey === beforeKey) return;
    const rest = tabs.filter((k) => k !== dragKey);
    const insertAt = beforeKey ? rest.indexOf(beforeKey) : rest.length;
    rest.splice(insertAt < 0 ? rest.length : insertAt, 0, dragKey);
    persist(rest);
  }

  function remove(key: TabKey) {
    persist(tabs.filter((k) => k !== key));
  }

  return (
    <nav className="flex flex-wrap gap-2 px-6 py-4 sm:px-10">
      {tabs.map((key) => {
        const tab = TABS_BY_KEY[key];
        if (!tab) return null;
        const href = tab.path ? `${base}/${tab.path}` : base;
        const active = pathname === href;
        const draggableTab = editMode && key !== "dashboard";

        return (
          <div
            key={key}
            className={draggableTab ? "relative select-none" : "relative"}
            draggable={draggableTab}
            onDragStart={() => draggableTab && setDragKey(key)}
            onDragOver={(e) => draggableTab && e.preventDefault()}
            onDrop={(e) => {
              if (!draggableTab) return;
              e.preventDefault();
              moveTo(key);
              setDragKey(null);
            }}
          >
            {draggableTab && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  remove(key);
                }}
                aria-label={`Remove ${tab.label} tab`}
                className="absolute -right-1.5 -top-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold leading-none text-white shadow hover:bg-red-400"
              >
                ×
              </button>
            )}
            <Link
              href={href}
              draggable={false}
              className={`block rounded-lg px-4 py-1.5 text-sm font-medium transition-all duration-150 ease-out hover:-translate-y-0.5 ${
                editMode && key !== "dashboard" ? "cursor-grab active:cursor-grabbing" : ""
              } ${
                active
                  ? "bg-[var(--accent)] text-black"
                  : "border border-white/30 text-white/90 hover:border-white/60 hover:bg-white/5"
              }`}
            >
              {tab.label}
            </Link>
          </div>
        );
      })}
      {editMode && (
        <div
          onDragOver={(e) => dragKey && e.preventDefault()}
          onDrop={(e) => {
            if (!dragKey) return;
            e.preventDefault();
            moveTo(null);
            setDragKey(null);
          }}
          className="flex items-center rounded-lg border border-dashed border-white/20 px-3 text-xs text-white/30"
        >
          drag to reorder · × to remove
        </div>
      )}
    </nav>
  );
}
