export type GifResult = { id: string; previewUrl: string; url: string };

type GiphySearchResponse = {
  data?: {
    id: string;
    images?: {
      fixed_width_small?: { url?: string };
      original?: { url?: string };
    };
  }[];
};

/** Powers the GIF picker in the Discussion section — a thin wrapper over
 * Giphy's public search endpoint, same shape as googleImageSearch.ts's own
 * "throw a readable message if the key isn't set" convention. */
export async function searchGiphy(query: string): Promise<GifResult[]> {
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) {
    throw new Error("GIF search needs GIPHY_API_KEY set — ask whoever manages this app to add one.");
  }

  const res = await fetch(
    `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=24&rating=pg-13`
  );
  if (!res.ok) throw new Error(`Giphy search returned ${res.status}`);
  const data: GiphySearchResponse = await res.json();

  return (data.data ?? [])
    .map((g) => ({
      id: g.id,
      previewUrl: g.images?.fixed_width_small?.url ?? g.images?.original?.url ?? "",
      url: g.images?.original?.url ?? "",
    }))
    .filter((g) => g.previewUrl && g.url);
}
