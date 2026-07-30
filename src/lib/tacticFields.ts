export const TACTIC_CHANNELS = ["Social", "OOH", "PPC", "Audio", "Video", "Experiential"] as const;
export type TacticChannel = (typeof TACTIC_CHANNELS)[number];

export const TACTIC_PILLARS = [
  { value: "tease", label: "Tease" },
  { value: "launch", label: "Release" },
  { value: "sustain", label: "Sustain" },
] as const;
export type TacticPillar = (typeof TACTIC_PILLARS)[number]["value"];

export const TACTIC_STATUSES = [
  { value: "planned", label: "Planned" },
  { value: "approved", label: "Approved" },
  { value: "booked", label: "Booked" },
  { value: "archived", label: "Archived" },
] as const;
export type TacticStatus = (typeof TACTIC_STATUSES)[number]["value"];

// A starting set of common audience segments — the picker also lets
// whoever's filling the form add their own beyond this list (stored
// alongside the presets in the same string array, no separate table).
export const TACTIC_AUDIENCE_PRESETS = ["Gen Z", "Gen X", "Millennial", "Gen Jones", "Fashion"];
