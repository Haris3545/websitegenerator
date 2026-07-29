export type ImageSearchResult = {
  thumbnail: string;
  original: string;
  title: string;
  source: string;
};

type SerpApiImagesResponse = {
  images_results?: {
    thumbnail?: string;
    original?: string;
    title?: string;
    source?: string;
  }[];
};

/** SerpApi's google_images engine — reuses the same SERPAPI_KEY the search
 * trends chart already depends on (googleTrends.ts), rather than adding a
 * whole separate Google Custom Search API credential just for this. Results
 * point at arbitrary third-party-hosted images, which is fine for a preview
 * grid but not something to hotlink from a live artist site directly (dead
 * links, hotlink protection, no control over the source disappearing) — the
 * caller downloads and re-hosts whichever one gets picked (see
 * searchActions.ts's importImageFromUrl). */
export async function searchGoogleImages(query: string): Promise<ImageSearchResult[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    throw new Error("SERPAPI_KEY isn't set — ask whoever manages this app's Vercel project to add it.");
  }

  const res = await fetch(
    `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&api_key=${apiKey}`
  );
  if (!res.ok) throw new Error(`SerpApi google_images returned ${res.status}`);
  const data: SerpApiImagesResponse = await res.json();

  return (data.images_results ?? [])
    .filter((img) => img.thumbnail && img.original)
    .slice(0, 40)
    .map((img) => ({
      thumbnail: img.thumbnail as string,
      original: img.original as string,
      title: img.title ?? "",
      source: img.source ?? "",
    }));
}
