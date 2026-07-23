import { XMLParser } from "fast-xml-parser";
import { createServiceRoleClient } from "@/lib/supabase/server";

const STALE_AFTER_MS = 30 * 60 * 1000; // 30 minutes

type RssItem = {
  title: string;
  link: string;
  pubDate?: string;
  source?: { "#text"?: string } | string;
  description?: string;
};

/** Fetches Google News' public RSS feed for the artist and caches new
 * articles. Uses the service-role client since this is a background data
 * pipeline, not a request scoped to the visiting user's own permissions. */
export async function refreshMediaForArtist(artistId: string, artistName: string) {
  const query = encodeURIComponent(`"${artistName}"`);
  const feedUrl = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

  const res = await fetch(feedUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Google News RSS returned ${res.status}`);
  const xml = await res.text();

  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xml);
  // fast-xml-parser returns a single <item> as an object rather than a
  // one-element array, so a feed with exactly one result would otherwise
  // throw on the .slice() below and get swallowed by the caller's try/catch.
  const rawItems = parsed?.rss?.channel?.item ?? [];
  const items: RssItem[] = Array.isArray(rawItems) ? rawItems : [rawItems];

  const supabase = createServiceRoleClient();
  const rows = items.slice(0, 40).map((item) => {
    const sourceText =
      typeof item.source === "string" ? item.source : item.source?.["#text"];
    const url = item.link;
    let host = sourceText ?? "";
    try {
      host = host || new URL(url).hostname.replace(/^www\./, "");
    } catch {
      // leave host as-is if the link isn't a valid absolute URL
    }
    return {
      artist_id: artistId,
      title: stripHtml(item.title),
      url,
      source: host,
      excerpt: stripHtml(item.description ?? "").slice(0, 400),
      published_at: parseDateSafe(item.pubDate),
      fetched_at: new Date().toISOString(),
    };
  });

  if (rows.length) {
    const { error } = await supabase
      .from("media_articles")
      .upsert(rows, { onConflict: "artist_id,url" });
    if (error) throw new Error(error.message);
  }

  return rows.length;
}

export async function refreshMediaIfStale(artistId: string, artistName: string) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("media_articles")
    .select("fetched_at")
    .eq("artist_id", artistId)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isStale =
    !data?.fetched_at || Date.now() - new Date(data.fetched_at).getTime() > STALE_AFTER_MS;

  if (isStale) {
    try {
      await refreshMediaForArtist(artistId, artistName);
    } catch (err) {
      // Stale cache is fine to serve if the live refresh fails (feed hiccup,
      // rate limit) — but log so a persistently-empty ticker is diagnosable
      // from Vercel function logs instead of failing completely silently.
      console.error(`refreshMediaIfStale failed for artist ${artistId}:`, err);
    }
  }
}

const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

// Google News descriptions are a full HTML snippet (a linked thumbnail,
// title, and source, glued together with &nbsp; spacers) — stripping tags
// alone leaves those entities behind as literal "&nbsp;&nbsp;" text.
function stripHtml(input: string) {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&#?\w+;/g, (entity) => HTML_ENTITIES[entity] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDateSafe(value: string | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}
