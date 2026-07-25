import { createServiceRoleClient } from "@/lib/supabase/server";
import type { SocialMention } from "@/lib/database.types";

const STALE_AFTER_MS = 60 * 60 * 1000; // 1 hour

type MentionRow = Omit<SocialMention, "id" | "fetched_at"> & { fetched_at: string };

type RedditTokenResponse = { access_token?: string };

type RedditSearchResponse = {
  data?: {
    children?: {
      data?: {
        id?: string;
        title?: string;
        selftext?: string;
        author?: string;
        permalink?: string;
        score?: number;
        created_utc?: number;
      };
    }[];
  };
};

type YoutubeSearchResponse = {
  items?: {
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      description?: string;
      channelTitle?: string;
      publishedAt?: string;
    };
  }[];
};

const REDDIT_USER_AGENT = "websitegenerator:cultural-intelligence:v1.0 (by /u/vccp-media)";

async function fetchRedditMentions(artistId: string, artistName: string): Promise<MentionRow[]> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": REDDIT_USER_AGENT,
    },
    body: "grant_type=client_credentials",
  });
  if (!tokenRes.ok) throw new Error(`Reddit auth returned ${tokenRes.status}`);
  const tokenData: RedditTokenResponse = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Reddit auth returned no access token.");

  const searchRes = await fetch(
    `https://oauth.reddit.com/search?q=${encodeURIComponent(`"${artistName}"`)}&sort=new&limit=25`,
    {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "User-Agent": REDDIT_USER_AGENT,
      },
    }
  );
  if (!searchRes.ok) throw new Error(`Reddit search returned ${searchRes.status}`);
  const searchData: RedditSearchResponse = await searchRes.json();

  return (searchData.data?.children ?? [])
    .map((child) => child.data)
    .filter((post): post is NonNullable<typeof post> => !!post?.id && !!post.permalink)
    .map((post) => ({
      artist_id: artistId,
      platform: "reddit",
      title: post.title ?? "",
      url: `https://reddit.com${post.permalink}`,
      author: post.author ? `u/${post.author}` : null,
      excerpt: (post.selftext ?? "").slice(0, 400),
      score: post.score ?? null,
      published_at: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
      fetched_at: new Date().toISOString(),
    }));
}

async function fetchYoutubeMentions(artistId: string, artistName: string): Promise<MentionRow[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(artistName)}&order=date&maxResults=15&type=video&key=${apiKey}`
  );
  if (!res.ok) throw new Error(`YouTube search API returned ${res.status}`);
  const data: YoutubeSearchResponse = await res.json();

  return (data.items ?? [])
    .filter((item) => item.id?.videoId)
    .map((item) => ({
      artist_id: artistId,
      platform: "youtube",
      title: item.snippet?.title ?? "",
      url: `https://youtube.com/watch?v=${item.id!.videoId}`,
      author: item.snippet?.channelTitle ?? null,
      excerpt: (item.snippet?.description ?? "").slice(0, 400),
      score: null,
      published_at: item.snippet?.publishedAt ?? null,
      fetched_at: new Date().toISOString(),
    }));
}

/** Best-effort per platform — a Reddit failure shouldn't drop YouTube
 * results and vice versa. Whichever secrets aren't set (see
 * fetchRedditMentions/fetchYoutubeMentions) contribute zero rows rather
 * than erroring, since it's normal for an artist to only have one of the
 * two configured. */
export async function refreshSocialListeningForArtist(artistId: string, artistName: string) {
  const results = await Promise.allSettled([
    fetchRedditMentions(artistId, artistName),
    fetchYoutubeMentions(artistId, artistName),
  ]);

  const rows: MentionRow[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") rows.push(...result.value);
    else console.error("refreshSocialListeningForArtist: a platform fetch failed:", result.reason);
  }

  if (!rows.length) return 0;

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("social_mentions")
    .upsert(rows, { onConflict: "artist_id,url" });
  if (error) throw new Error(error.message);

  return rows.length;
}

export async function refreshSocialListeningIfStale(artistId: string, artistName: string) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("social_mentions")
    .select("fetched_at")
    .eq("artist_id", artistId)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isStale =
    !data?.fetched_at || Date.now() - new Date(data.fetched_at).getTime() > STALE_AFTER_MS;
  if (!isStale) return;

  try {
    await refreshSocialListeningForArtist(artistId, artistName);
  } catch (err) {
    console.error(`refreshSocialListeningIfStale failed for artist ${artistId}:`, err);
  }
}
