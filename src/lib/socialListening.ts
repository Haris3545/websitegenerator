import { GoogleGenAI, Type } from "@google/genai";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { SocialComment, SocialCommentCategory } from "@/lib/database.types";

const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours — heavier than a simple mentions fetch
const REDDIT_USER_AGENT = "websitegenerator:cultural-intelligence:v1.0 (by /u/vccp-media)";
const MAX_COMMENTS = 150;

type RedditSearchResponse = {
  data?: {
    children?: { data?: { title?: string; permalink?: string } }[];
  };
};

type RedditCommentListing = {
  data?: {
    children?: {
      kind?: string;
      data?: { author?: string; body?: string; score?: number; created_utc?: number; permalink?: string };
    }[];
  };
};

async function fetchRedditPostComments(postPermalink: string, postTitle: string): Promise<SocialComment[]> {
  try {
    const res = await fetch(`https://www.reddit.com${postPermalink}.json?limit=10&depth=1&raw_json=1`, {
      headers: { "User-Agent": REDDIT_USER_AGENT },
    });
    if (!res.ok) return [];
    const data: RedditCommentListing[] = await res.json();
    const comments = data[1]?.data?.children ?? [];

    return comments
      .filter(
        (c): c is { kind: string; data: NonNullable<(typeof comments)[number]["data"]> } =>
          c.kind === "t1" && !!c.data?.body && c.data.body !== "[deleted]" && c.data.body !== "[removed]"
      )
      .slice(0, 8)
      .map((c) => ({
        platform: "reddit" as const,
        author: c.data.author ? `u/${c.data.author}` : "unknown",
        text: (c.data.body ?? "").slice(0, 500),
        score: c.data.score ?? null,
        url: c.data.permalink ? `https://reddit.com${c.data.permalink}` : `https://reddit.com${postPermalink}`,
        context: postTitle,
        publishedAt: c.data.created_utc ? new Date(c.data.created_utc * 1000).toISOString() : null,
      }));
  } catch {
    return [];
  }
}

/** Finds Reddit posts mentioning the artist (via Reddit's public search —
 * no app/OAuth needed, see below), then pulls the actual top-level
 * comments from each, rather than treating the posts themselves as the
 * "mentions" — a post title says a lot less than what people are actually
 * saying underneath it. */
async function fetchRedditComments(artistName: string): Promise<SocialComment[]> {
  const searchRes = await fetch(
    `https://www.reddit.com/search.json?q=${encodeURIComponent(`"${artistName}"`)}&sort=comments&limit=10&raw_json=1`,
    { headers: { "User-Agent": REDDIT_USER_AGENT } }
  );
  if (!searchRes.ok) throw new Error(`Reddit search returned ${searchRes.status}`);
  const searchData: RedditSearchResponse = await searchRes.json();

  const posts = (searchData.data?.children ?? [])
    .map((c) => c.data)
    .filter((p): p is NonNullable<typeof p> & { permalink: string } => !!p?.permalink)
    .slice(0, 8);

  const batches = await Promise.all(posts.map((p) => fetchRedditPostComments(p.permalink, p.title ?? "")));
  return batches.flat();
}

type YoutubeSearchResponse = {
  items?: { id?: { videoId?: string }; snippet?: { title?: string } }[];
};

type YoutubeCommentThreadsResponse = {
  items?: {
    snippet?: {
      topLevelComment?: {
        snippet?: {
          authorDisplayName?: string;
          textDisplay?: string;
          likeCount?: number;
          publishedAt?: string;
        };
      };
    };
  }[];
};

async function fetchYoutubeVideoComments(
  videoId: string,
  videoTitle: string,
  apiKey: string
): Promise<SocialComment[]> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${encodeURIComponent(videoId)}&maxResults=15&order=relevance&key=${apiKey}`
    );
    if (!res.ok) return []; // comments can be disabled on a video — not worth failing the whole refresh over
    const data: YoutubeCommentThreadsResponse = await res.json();

    return (data.items ?? [])
      .map((item) => item.snippet?.topLevelComment?.snippet)
      .filter((s): s is NonNullable<typeof s> => !!s?.textDisplay)
      .map((s) => ({
        platform: "youtube" as const,
        author: s.authorDisplayName ?? "unknown",
        text: (s.textDisplay ?? "").replace(/<[^>]*>/g, "").slice(0, 500),
        score: s.likeCount ?? null,
        url: `https://youtube.com/watch?v=${videoId}`,
        context: videoTitle,
        publishedAt: s.publishedAt ?? null,
      }));
  } catch {
    return [];
  }
}

/** Pulls comments from the artist's own recent videos (already tracked in
 * youtube_stats) plus a handful of third-party videos that mention the
 * artist by name — fan reactions on the artist's own uploads are the most
 * directly relevant source, third-party videos widen the net. */
async function fetchYoutubeComments(artistId: string, artistName: string): Promise<SocialComment[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  const supabase = createServiceRoleClient();
  const { data: youtubeStats } = await supabase
    .from("youtube_stats")
    .select("recent_videos")
    .eq("artist_id", artistId)
    .maybeSingle();

  const ownVideos = (youtubeStats?.recent_videos ?? [])
    .slice(0, 5)
    .map((v) => ({ id: v.id, title: v.title }));

  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(artistName)}&order=relevance&maxResults=5&type=video&key=${apiKey}`
  );
  const thirdPartyVideos: { id: string; title: string }[] = [];
  if (searchRes.ok) {
    const searchData: YoutubeSearchResponse = await searchRes.json();
    for (const item of searchData.items ?? []) {
      if (item.id?.videoId) thirdPartyVideos.push({ id: item.id.videoId, title: item.snippet?.title ?? "" });
    }
  }

  const videos = [...ownVideos, ...thirdPartyVideos];
  const batches = await Promise.all(videos.map((v) => fetchYoutubeVideoComments(v.id, v.title, apiKey)));
  return batches.flat();
}

const geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const CATEGORY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    categories: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          subcategories: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                commentIndexes: { type: Type.ARRAY, items: { type: Type.NUMBER } },
              },
              required: ["name", "commentIndexes"],
            },
          },
        },
        required: ["name", "subcategories"],
      },
    },
  },
  required: ["categories"],
};

/** Clusters raw comments into a category -> subcategory tree for the
 * zoomable map, driven entirely by what's actually in this batch of
 * comments rather than a fixed taxonomy — Gemini invents category names
 * that fit the real content. Comments it can't confidently place (spam,
 * unrelated) are just left out rather than forced somewhere. */
async function categorizeComments(
  artistName: string,
  comments: SocialComment[]
): Promise<SocialCommentCategory[]> {
  const digest = comments
    .map((c, i) => `[${i}] (${c.platform}) ${c.text.replace(/\s+/g, " ").slice(0, 300)}`)
    .join("\n");

  const response = await geminiClient.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents:
      `These are real Reddit and YouTube comments mentioning the artist "${artistName}". Organize ` +
      "them into a two-level taxonomy that reflects what's ACTUALLY being talked about: 3-6 " +
      "top-level categories (e.g. reactions to a specific release, tour/ticket chatter, comparisons " +
      "to other artists, nostalgia, criticism — invent whatever genuinely fits this data, don't " +
      "force a fixed template), each with 1-4 more specific subcategories. Assign every comment's " +
      "index number to exactly one subcategory it fits best. Skip comments that are pure spam or " +
      "totally unrelated — you don't need to place every single one, but place as many genuine " +
      `ones as you reasonably can.\n\nComments:\n${digest}`,
    config: { responseMimeType: "application/json", responseSchema: CATEGORY_SCHEMA },
  });

  const parsed = JSON.parse(response.text ?? "{}");
  const rawCategories: { name?: string; subcategories?: { name?: string; commentIndexes?: number[] }[] }[] =
    Array.isArray(parsed.categories) ? parsed.categories : [];

  return rawCategories
    .filter((c) => c.name)
    .map((c) => ({
      name: c.name as string,
      subcategories: (c.subcategories ?? [])
        .filter((s) => s.name)
        .map((s) => ({
          name: s.name as string,
          comments: (s.commentIndexes ?? []).map((i) => comments[i]).filter((c): c is SocialComment => !!c),
        }))
        .filter((s) => s.comments.length > 0),
    }))
    .filter((c) => c.subcategories.length > 0);
}

/** Best-effort per platform — a Reddit failure shouldn't drop YouTube
 * results and vice versa. YouTube contributes zero rows rather than
 * erroring when YOUTUBE_API_KEY isn't set. When both come back empty, this
 * records WHY in last_error — Reddit's public search endpoint has no API
 * key to misconfigure, but it's known to occasionally 403/429 requests
 * coming from cloud/datacenter IP ranges (which is what a Vercel serverless
 * function is), so "no comments" can be a real platform-side block rather
 * than a genuine lack of mentions — worth surfacing rather than leaving the
 * UI's empty state looking identical either way. */
export async function refreshSocialListeningForArtist(artistId: string, artistName: string) {
  const results = await Promise.allSettled([
    fetchRedditComments(artistName),
    fetchYoutubeComments(artistId, artistName),
  ]);

  const comments: SocialComment[] = [];
  const [redditResult, youtubeResult] = results;
  if (redditResult.status === "fulfilled") comments.push(...redditResult.value);
  if (youtubeResult.status === "fulfilled") comments.push(...youtubeResult.value);

  const supabase = createServiceRoleClient();

  if (!comments.length) {
    const reasons: string[] = [];
    if (redditResult.status === "rejected") {
      reasons.push(`Reddit: ${redditResult.reason instanceof Error ? redditResult.reason.message : "fetch failed"}`);
    }
    if (!process.env.YOUTUBE_API_KEY) {
      reasons.push("YouTube: YOUTUBE_API_KEY isn't set");
    } else if (youtubeResult.status === "rejected") {
      reasons.push(`YouTube: ${youtubeResult.reason instanceof Error ? youtubeResult.reason.message : "fetch failed"}`);
    }
    const lastError = reasons.length
      ? reasons.join("; ")
      : "Both platforms returned zero mentions for this search — not necessarily an error, might just be genuinely quiet right now.";
    console.error(`refreshSocialListeningForArtist: no comments found for ${artistName}: ${lastError}`);

    await supabase.from("social_comment_map").upsert({
      artist_id: artistId,
      categories: [],
      comment_count: 0,
      last_error: lastError,
      computed_at: new Date().toISOString(),
    });
    return 0;
  }

  const trimmed = comments.slice(0, MAX_COMMENTS);
  const categories = await categorizeComments(artistName, trimmed);

  const { error } = await supabase.from("social_comment_map").upsert({
    artist_id: artistId,
    categories,
    comment_count: trimmed.length,
    last_error: null,
    computed_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  return trimmed.length;
}

export async function refreshSocialListeningIfStale(artistId: string, artistName: string) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("social_comment_map")
    .select("computed_at")
    .eq("artist_id", artistId)
    .maybeSingle();

  const isStale =
    !data?.computed_at || Date.now() - new Date(data.computed_at).getTime() > STALE_AFTER_MS;
  if (!isStale) return;

  try {
    await refreshSocialListeningForArtist(artistId, artistName);
  } catch (err) {
    console.error(`refreshSocialListeningIfStale failed for artist ${artistId}:`, err);
  }
}
