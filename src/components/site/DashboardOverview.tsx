"use client";

import { useMemo, useState, useTransition } from "react";
import { updateSentimentFilters } from "@/app/s/[slug]/actions";
import { ArticleCard } from "@/components/site/ArticleCard";
import type { MediaArticle, SentimentFilter, SentimentSummary } from "@/lib/database.types";

export function DashboardOverview({
  artistId,
  summary,
  articles,
}: {
  artistId: string;
  summary: SentimentSummary;
  articles: MediaArticle[];
}) {
  const [filters, setFilters] = useState<SentimentFilter[]>(summary.filters ?? []);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const activeFilter = filters.find((f) => f.label === activeLabel) ?? null;

  const filteredArticles = useMemo(() => {
    if (!activeFilter) return [];
    const needles = activeFilter.keywords.map((k) => k.toLowerCase()).filter(Boolean);
    if (!needles.length) return [];
    return articles.filter((a) => {
      const haystack = `${a.title} ${a.excerpt}`.toLowerCase();
      return needles.some((n) => haystack.includes(n));
    });
  }, [articles, activeFilter]);

  function saveFilters(next: SentimentFilter[]) {
    setFilters(next);
    startTransition(() => updateSentimentFilters(artistId, next));
  }

  const { positive_pct = 0, negative_pct = 0, neutral_pct = 0 } = summary;
  const hasSentimentData = positive_pct + negative_pct + neutral_pct > 0;

  return (
    <div className="mb-8">
      {hasSentimentData && (
        <div
          className="p-4 shadow-lg shadow-black/30 backdrop-blur-md"
          style={{
            borderRadius: "var(--card-radius, 12px)",
            backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
            border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
          }}
        >
          <p
            className="text-xs uppercase tracking-wide opacity-60"
            style={{ color: "var(--card-text-color, #fff)" }}
          >
            Overall sentiment
          </p>
          <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-white/10">
            {positive_pct > 0 && (
              <div style={{ width: `${positive_pct}%`, backgroundColor: "#22c55e" }} />
            )}
            {neutral_pct > 0 && (
              <div style={{ width: `${neutral_pct}%`, backgroundColor: "rgba(255,255,255,0.35)" }} />
            )}
            {negative_pct > 0 && (
              <div style={{ width: `${negative_pct}%`, backgroundColor: "#ef4444" }} />
            )}
          </div>
          <div
            className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs"
            style={{ color: "var(--card-text-color, #fff)" }}
          >
            <span className="opacity-80">{positive_pct}% positive</span>
            <span className="opacity-60">{neutral_pct}% neutral</span>
            <span className="opacity-80">{negative_pct}% negative</span>
          </div>
        </div>
      )}

      {filters.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {filters.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setActiveLabel(activeLabel === f.label ? null : f.label)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                activeLabel === f.label
                  ? "border-[var(--accent)] bg-[var(--accent)] text-black"
                  : "border-[var(--accent)]/50 text-[var(--accent)] hover:border-[var(--accent)]"
              }`}
            >
              {f.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white/50 hover:border-white/40 hover:text-white"
          >
            Edit filters
          </button>
        </div>
      )}

      {activeFilter && (
        <div className="mt-4 flex flex-col gap-3">
          {filteredArticles.length === 0 ? (
            <p className="text-sm text-white/40">
              No cached articles match &quot;{activeFilter.label}&quot; yet.
            </p>
          ) : (
            filteredArticles.slice(0, 5).map((a) => <ArticleCard key={a.id} article={a} />)
          )}
        </div>
      )}

      {editing && (
        <FilterEditPanel
          filters={filters}
          isSaving={isPending}
          onCancel={() => setEditing(false)}
          onSave={(next) => {
            saveFilters(next);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function FilterEditPanel({
  filters,
  onSave,
  onCancel,
  isSaving,
}: {
  filters: SentimentFilter[];
  onSave: (next: SentimentFilter[]) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState(
    filters.map((f) => ({ label: f.label, keywordsText: f.keywords.join(", ") }))
  );

  function update(i: number, patch: Partial<{ label: string; keywordsText: string }>) {
    setDraft((d) => d.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function remove(i: number) {
    setDraft((d) => d.filter((_, idx) => idx !== i));
  }

  function handleSave() {
    onSave(
      draft
        .filter((row) => row.label.trim())
        .map((row) => ({
          label: row.label.trim(),
          keywords: row.keywordsText
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
        }))
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-6 pt-20">
      <div className="w-full max-w-lg rounded-xl border border-white/15 bg-neutral-900 p-6 text-white shadow-2xl">
        <h2 className="text-lg font-semibold">Edit filters</h2>
        <p className="mt-1 text-sm text-white/50">
          Each filter matches cached articles containing any of its keywords — editing one changes
          what it actually finds.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {draft.map((row, i) => (
            <div key={i} className="rounded-lg border border-white/10 p-3">
              <div className="flex items-center gap-2">
                <input
                  value={row.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  className="flex-1 rounded border border-white/20 bg-black/30 px-2 py-1 text-sm font-medium"
                  placeholder="Filter label"
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="rounded border border-white/20 px-2 py-1 text-xs text-white/50 hover:text-white"
                >
                  Remove
                </button>
              </div>
              <input
                value={row.keywordsText}
                onChange={(e) => update(i, { keywordsText: e.target.value })}
                className="mt-2 w-full rounded border border-white/20 bg-black/30 px-2 py-1 text-xs"
                placeholder="Comma-separated keywords, e.g. tour, album, single"
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setDraft((d) => [...d, { label: "New filter", keywordsText: "" }])}
          className="mt-3 text-sm text-[var(--accent)] hover:underline"
        >
          + Add filter
        </button>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-white/20 px-3 py-1.5 text-sm text-white/70 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
