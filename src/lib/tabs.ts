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

/** Phase 1 has live data behind Dashboard + Media; everything else is a
 * "coming soon" placeholder that still respects the enabled/disabled toggle. */
export const LIVE_TABS: TabKey[] = ["dashboard", "media"];
