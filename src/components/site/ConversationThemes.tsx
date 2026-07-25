import { colorForTheme } from "@/lib/conversationThemes";
import type { ConversationTheme } from "@/lib/database.types";

/** A ranked horizontal bar list of recurring conversation themes — mirrors
 * the reference layout: theme name in its own color, a filled pill-shaped
 * bar sized relative to the top theme, and the raw count on the right. */
export function ConversationThemes({ themes }: { themes: ConversationTheme[] }) {
  if (!themes.length) return null;
  const maxCount = Math.max(...themes.map((t) => t.count));

  return (
    <div
      className="p-6 shadow-lg shadow-black/30 backdrop-blur-md"
      style={{
        borderRadius: "var(--card-radius, 12px)",
        backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
        border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
      }}
    >
      <h3 className="mb-5 text-sm font-bold uppercase tracking-wide text-[var(--accent)]">
        Conversation themes
      </h3>
      <div className="flex flex-col gap-4">
        {themes.map((theme) => {
          const color = colorForTheme(theme.name);
          const widthPct = Math.max(4, (theme.count / maxCount) * 100);
          return (
            <div key={theme.name} className="grid grid-cols-[minmax(7rem,auto)_1fr_3rem] items-center gap-3">
              <span className="truncate text-sm font-semibold" style={{ color }}>
                {theme.name}
              </span>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${widthPct}%`, backgroundColor: color }}
                />
              </div>
              <span className="text-right text-sm font-semibold" style={{ color: "var(--card-text-color, #fff)" }}>
                {theme.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
