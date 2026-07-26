import type { WordCloudEntry } from "@/lib/database.types";

const MIN_SIZE_REM = 0.75;
const MAX_SIZE_REM = 2.25;

/** A plain CSS flex-wrap tag cloud — font size and opacity scaled by
 * mention count — rather than pulling in a canvas-layout word-cloud
 * library for what's fundamentally a ranked list of words/phrases. */
export function WordCloud({ entries }: { entries: WordCloudEntry[] }) {
  if (!entries.length) return null;

  const counts = entries.map((e) => e.count);
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);
  const range = maxCount - minCount || 1;

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
        Most talked-about words &amp; phrases
      </h3>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        {entries.map((entry) => {
          const t = (entry.count - minCount) / range;
          const size = MIN_SIZE_REM + t * (MAX_SIZE_REM - MIN_SIZE_REM);
          return (
            <span
              key={entry.text}
              className="font-semibold leading-none"
              style={{
                fontSize: `${size}rem`,
                color: "var(--card-text-color, #fff)",
                opacity: 0.5 + t * 0.5,
              }}
              title={`${entry.count} mentions`}
            >
              {entry.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}
