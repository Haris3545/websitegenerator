import type { GeniusAnnotation } from "@/lib/database.types";

/** Fan-submitted "what does this line mean" annotations from Genius,
 * grouped under the song they're attached to and ranked by votes within
 * each song — the only integration in this app that surfaces lyric-level
 * discussion rather than general artist chatter. */
export function GeniusAnnotations({ annotations }: { annotations: GeniusAnnotation[] }) {
  if (!annotations.length) return null;

  const bySong = new Map<string, { songUrl: string; items: GeniusAnnotation[] }>();
  for (const a of annotations) {
    const entry = bySong.get(a.songTitle) ?? { songUrl: a.songUrl, items: [] };
    entry.items.push(a);
    bySong.set(a.songTitle, entry);
  }

  return (
    <div className="mt-8">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-white/70">
        <span className="h-3 w-1 bg-[var(--accent)]" />
        Lyrics &amp; fan annotations
      </h3>
      <div className="flex flex-col gap-3">
        {[...bySong.entries()].map(([songTitle, { songUrl, items }]) => (
          <div
            key={songTitle}
            className="p-4 shadow-lg shadow-black/30"
            style={{
              borderRadius: "var(--card-radius, 12px)",
              backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
              border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
            }}
          >
            <a
              href={songUrl || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold hover:underline"
              style={{ color: "var(--accent)" }}
            >
              {songTitle}
            </a>
            <div className="mt-2 flex flex-col gap-3">
              {items.map((a, i) => (
                <div key={i} className="border-l-2 border-white/15 pl-3">
                  <p className="text-sm italic" style={{ color: "var(--card-text-color, #fff)" }}>
                    &quot;{a.fragment}&quot;
                  </p>
                  <p className="mt-1 text-xs opacity-70" style={{ color: "var(--card-text-color, #fff)" }}>
                    {a.annotation}
                  </p>
                  {a.votes > 0 && (
                    <p className="mt-1 text-[10px] uppercase tracking-wide opacity-40" style={{ color: "var(--card-text-color, #fff)" }}>
                      {a.votes} vote{a.votes === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] uppercase tracking-wide opacity-30" style={{ color: "var(--card-text-color, #fff)" }}>
        Source: Genius API.
      </p>
    </div>
  );
}
