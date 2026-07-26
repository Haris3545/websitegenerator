"use client";

import { useState } from "react";
import { colorForTheme } from "@/lib/conversationThemeColors";
import type { ConversationTheme } from "@/lib/database.types";

/** A ranked horizontal bar list of recurring conversation themes, sized by
 * share of total discussion rather than a raw count (a snippet can match
 * more than one theme, so these don't need to sum to 100%). Tapping a
 * theme expands specific quotes it matched on, rather than leaving
 * abstract labels like "Criticism" with no sense of what's actually being
 * said. */
export function ConversationThemes({ themes }: { themes: ConversationTheme[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!themes.length) return null;

  const total = themes.reduce((sum, t) => sum + t.count, 0);

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
      <div className="flex flex-col gap-1">
        {themes.map((theme) => {
          const color = colorForTheme(theme.name);
          const pct = total ? (theme.count / total) * 100 : 0;
          const isOpen = expanded === theme.name;
          return (
            <div key={theme.name} className="flex flex-col">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : theme.name)}
                disabled={!theme.examples.length}
                className="grid grid-cols-[minmax(7rem,auto)_1fr_3.5rem] items-center gap-3 rounded py-1.5 text-left transition-colors hover:bg-white/5 disabled:pointer-events-none"
              >
                <span className="truncate text-sm font-semibold" style={{ color }}>
                  {theme.name}
                </span>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${Math.max(4, pct)}%`, backgroundColor: color }}
                  />
                </div>
                <span
                  className="text-right text-sm font-semibold"
                  style={{ color: "var(--card-text-color, #fff)" }}
                >
                  {pct.toFixed(0)}%
                </span>
              </button>
              {isOpen && theme.examples.length > 0 && (
                <div className="mb-2 ml-1 mt-1 flex flex-col gap-1.5 border-l-2 pl-3" style={{ borderColor: color }}>
                  {theme.examples.map((example, i) => (
                    <p key={i} className="text-xs italic text-white/60">
                      &quot;{example}&quot;
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-white/30">
        % of total tagged discussion — a comment can match more than one theme. Tap a theme for specific examples.
      </p>
    </div>
  );
}
