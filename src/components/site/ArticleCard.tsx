import type { MediaArticle } from "@/lib/database.types";

export function ArticleCard({ article }: { article: MediaArticle }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noreferrer"
      className="block p-4 shadow-lg shadow-black/30 backdrop-blur-md transition hover:brightness-110"
      style={{
        borderRadius: "var(--card-radius, 12px)",
        backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
        border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
      }}
    >
      <div className="mb-1 flex items-start justify-between gap-3">
        <h3 className="font-semibold text-white">{article.title}</h3>
        <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">
          {article.source}
        </span>
      </div>
      {article.excerpt && <p className="text-sm text-white/60">{article.excerpt}</p>}
      {article.published_at && (
        <p className="mt-2 text-xs text-white/30">
          {new Date(article.published_at).toLocaleDateString()}
        </p>
      )}
    </a>
  );
}
