import type { TabKey } from "@/lib/database.types";

export const TABS: { key: TabKey; label: string; path: string }[] = [
  { key: "dashboard", label: "Dashboard", path: "" },
  { key: "media", label: "Media", path: "media" },
  { key: "social_listening", label: "Social listening", path: "social-listening" },
  { key: "music", label: "Music", path: "music" },
  { key: "youtube", label: "YouTube", path: "youtube" },
  { key: "audience", label: "Audience", path: "audience" },
  { key: "strategy", label: "Strategy", path: "strategy" },
  { key: "tactics", label: "Tactics", path: "tactics" },
  { key: "locations", label: "Locations", path: "locations" },
  { key: "ideas", label: "Ideas", path: "ideas" },
  { key: "calendar", label: "Calendar", path: "calendar" },
  { key: "research", label: "Research", path: "research" },
];

export const ALL_TAB_KEYS = TABS.map((t) => t.key);

export const TABS_BY_KEY: Record<TabKey, { key: TabKey; label: string; path: string }> =
  Object.fromEntries(TABS.map((t) => [t.key, t])) as Record<TabKey, (typeof TABS)[number]>;

/** Puts "dashboard" first (it's always on, never draggable/removable) and
 * dedupes, otherwise preserving enabled_tabs' own stored order — which is
 * what a visitor's tab/card drag-reordering in edit mode actually rewrites,
 * rather than always falling back to this file's fixed declaration order. */
export function orderedEnabledTabs(enabledTabs: TabKey[]): TabKey[] {
  const rest = enabledTabs.filter((k) => k !== "dashboard");
  return ["dashboard", ...rest];
}

/** Tabs with real functionality behind them; everything else is still a
 * "coming soon" placeholder that respects the enabled/disabled toggle. */
export const LIVE_TABS: TabKey[] = [
  "dashboard",
  "media",
  "strategy",
  "tactics",
  "ideas",
  "research",
  "audience",
  "locations",
  "calendar",
  "youtube",
  "social_listening",
  "music",
];
