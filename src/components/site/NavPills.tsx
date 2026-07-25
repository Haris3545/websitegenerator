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
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all duration-150 ease-out hover:-translate-y-0.5 ${
                active
                  ? "bg-[var(--accent)] text-black shadow-[0_0_16px_var(--accent)]"
                  : "border border-white/30 text-white/90 hover:border-white/60 hover:bg-white/5"
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
