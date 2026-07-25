"use client";

import { useState, useTransition } from "react";
import { addBoardItem, deleteBoardItem } from "@/app/s/[slug]/actions";
import type { BoardItem } from "@/lib/database.types";

const cardStyle = {
  borderRadius: "var(--card-radius, 12px)",
  backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
  border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
} as const;

const textStyle = { color: "var(--card-text-color, #fff)" } as const;

export function BoardList({
  artistId,
  boardKey,
  noun,
  initialItems,
}: {
  artistId: string;
  boardKey: string;
  noun: string;
  initialItems: BoardItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const singular = noun.replace(/s$/, "");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addBoardItem(artistId, boardKey, title, body);
      if (result.ok) {
        setItems((prev) => [result.item, ...prev]);
        setTitle("");
        setBody("");
      } else {
        setError(result.error);
      }
    });
  }

  function handleDelete(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    startTransition(() => deleteBoardItem(id));
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-2 p-4 shadow-lg shadow-black/30 backdrop-blur-md"
        style={cardStyle}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`New ${singular} title`}
          required
          className="rounded border border-white/20 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 transition-colors focus:border-[var(--accent)] focus:outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          className="rounded border border-white/20 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 transition-colors focus:border-[var(--accent)] focus:outline-none"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-black transition-all duration-150 ease-out hover:-translate-y-0.5 hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending ? "Adding..." : `+ New ${singular}`}
        </button>
      </form>

      {items.length === 0 ? (
        <div
          className="border-dashed p-12 text-center shadow-lg shadow-black/30 backdrop-blur-md"
          style={{ ...cardStyle, borderStyle: "dashed" }}
        >
          <p className="opacity-60" style={textStyle}>
            No {noun} yet — add the first one above.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="p-4 shadow-lg shadow-black/30 backdrop-blur-md transition-all duration-150 ease-out hover:-translate-y-0.5 hover:brightness-110"
              style={cardStyle}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold" style={textStyle}>
                  {item.title}
                </h3>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  className="shrink-0 text-xs opacity-40 transition-opacity hover:text-red-400 hover:opacity-100"
                  style={textStyle}
                >
                  Delete
                </button>
              </div>
              {item.body && (
                <p className="mt-1 text-sm opacity-70" style={textStyle}>
                  {item.body}
                </p>
              )}
              <p className="mt-2 text-xs opacity-40" style={textStyle}>
                {new Date(item.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
