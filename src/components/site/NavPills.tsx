"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS } from "@/lib/tabs";
import type { TabKey } from "@/lib/database.types";

export function NavPills({ slug, enabledTabs }: { slug: string; enabledTabs: TabKey[] }) {
  const pathname = usePathname();
  const base = `/s/${slug}`;

  return (
    <nav className="flex flex-wrap gap-2 px-6 py-4 sm:px-10">
      {TABS.filter((tab) => tab.key === "dashboard" || enabledTabs.includes(tab.key)).map(
        (tab) => {
          const href = tab.path ? `${base}/${tab.path}` : base;
          const active = pathname === href;
          return (
            <Link
              key={tab.key}
              href={href}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-[var(--accent)] text-black"
                  : "border border-white/30 text-white/90 hover:border-white/60"
              }`}
            >
              {tab.label}
            </Link>
          );
        }
      )}
    </nav>
  );
}
