type NewsApiArticle = {
  title?: string;
  url?: string;
  source?: { name?: string };
  description?: string | null;
  publishedAt?: string;
};

type NewsApiResponse = {
  status: string;
  articles?: NewsApiArticle[];
  message?: string;
};

export type NewsApiRow = {
  title: string;
  url: string;
  source: string;
  excerpt: string;
  published_at: string | null;
};

/** NewsAPI.org's /everything endpoint — richer metadata (real source
 * names, clean excerpts, reliable dates) than scraping Google News' RSS
 * feed, but needs a key and has its own rate limits. Runs alongside RSS
 * (see media.ts) rather than replacing it, so this degrades silently to []
 * — no key, a bad response, a network error — instead of throwing, since
 * it's meant to enrich the free feed, not become a hard dependency for the
 * Media tab to work at all. */
function normalizeApostrophes(s: string): string {
  return s.replace(/[‘’‚‛`´]/g, "'");
}

async function fetchNewsApiQuery(searchTerm: string, apiKey: string): Promise<NewsApiRow[]> {
  const query = encodeURIComponent(searchTerm);
  const res = await fetch(
    `https://newsapi.org/v2/everything?q=${query}&language=en&sortBy=publishedAt&pageSize=40&apiKey=${apiKey}`
  );
  if (!res.ok) {
    console.error(`NewsAPI returned ${res.status} for "${searchTerm}"`);
    return [];
  }
  const data: NewsApiResponse = await res.json();
  if (data.status !== "ok") return [];

  return (data.articles ?? [])
    .filter((a): a is NewsApiArticle & { title: string; url: string } => !!a.title && !!a.url)
    .map((a) => {
      let host = a.source?.name ?? "";
      try {
        host = host || new URL(a.url).hostname.replace(/^www\./, "");
      } catch {
        // leave host as-is if the URL somehow isn't valid
      }
      return {
        title: a.title,
        url: a.url,
        source: host,
        excerpt: (a.description ?? "").slice(0, 400),
        published_at: a.publishedAt ?? null,
      };
    });
}

export async function fetchNewsApiArticles(artistName: string): Promise<NewsApiRow[]> {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) return [];

  try {
    const name = normalizeApostrophes(artistName);
    const strict = await fetchNewsApiQuery(`"${name}"`, apiKey);
    // Same reasoning as Google News RSS's own fallback in media.ts — an
    // exact-phrase quoted search can come back completely empty for a name
    // with punctuation like an apostrophe, even when a looser search for
    // the same name finds plenty.
    if (strict.length > 0) return strict;
    return await fetchNewsApiQuery(name, apiKey);
  } catch (err) {
    console.error(`NewsAPI fetch failed for "${artistName}":`, err);
    return [];
  }
}
