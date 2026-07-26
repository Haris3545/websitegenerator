// Split out from conversationThemes.ts so the client-side ConversationThemes
// component (which needs colorForTheme for rendering) doesn't drag that
// file's server-only Supabase import into the browser bundle.
const THEME_COLORS: Record<string, string> = {
  Nostalgia: "#a78bfa",
  Musical: "#2dd4bf",
  Icon: "#facc15",
  Emotional: "#f472b6",
  "Hype & Anticipation": "#34d399",
  Criticism: "#9ca3af",
  Cultural: "#60a5fa",
  Discovery: "#22d3ee",
  Humour: "#38bdf8",
};

export function colorForTheme(name: string): string {
  return THEME_COLORS[name] ?? "#9ca3af";
}
