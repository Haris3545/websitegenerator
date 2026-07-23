"use client";

import { useState } from "react";
import { ArticleCard } from "@/components/site/ArticleCard";
import type { MediaArticle } from "@/lib/database.types";

const PAGE_SIZE = 10;

export function MediaList({ articles }: { articles: MediaArticle[] }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visible = articles.slice(0, visibleCount);
  const remaining = articles.length - visibleCount;

  return (
    <div className="flex flex-col items-start gap-3">
      <div className="mt-4 flex w-full flex-col gap-3">
        {visible.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="mt-1 rounded-full border border-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-black"
        >
          See more ({remaining} more)
        </button>
      )}
    </div>
  );
}
