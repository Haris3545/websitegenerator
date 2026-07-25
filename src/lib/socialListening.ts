import { createServiceRoleClient } from "@/lib/supabase/server";
import { categorizeCommentsLocally } from "@/lib/commentCategorizer";
import type { SocialComment } from "@/lib/database.types";

const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours — heavier than a simple mentions fetch
const MAX_COMMENTS = 1000;

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
      // 100 is the YouTube Data API's own per-request ceiling for this
      // endpoint — one request per video is enough to get meaningfully more
      // volume without adding pagination complexity for a second page.
      `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${encodeURIComponent(videoId)}&maxResults=100&order=relevance&key=${apiKey}`
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
 * youtube_stats) plus a wider net of third-party videos that mention the
 * artist by name — fan reactions on the artist's own uploads are the most
 * directly relevant source, third-party videos widen it further. Casting a
 * wide net here matters more now that categorization is local keyword
 * matching (see commentCategorizer.ts) rather than a Gemini call: more raw
 * comments make the resulting category map actually worth exploring. */
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
    .slice(0, 10)
    .map((v) => ({ id: v.id, title: v.title }));

  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(artistName)}&order=relevance&maxResults=10&type=video&key=${apiKey}`
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

/** Reddit is temporarily disabled: the Gemini-search-based discovery this
 * used (see git history) burned through the same free-tier Gemini quota
 * (20 requests/day) that sentiment/insights/events/wikipedia-trends share,
 * so on any real refresh it was routinely exhausted before anything else
 * that needed Gemini got to run. Re-add a Reddit source once there's quota
 * headroom (a paid tier) or a direct non-Gemini fetch to spend instead. */
export async function refreshSocialListeningForArtist(artistId: string, artistName: string) {
  const comments: SocialComment[] = [];
  let platformStatus: string;

  if (!process.env.YOUTUBE_API_KEY) {
    platformStatus = "YouTube: YOUTUBE_API_KEY isn't set";
  } else {
    try {
      comments.push(...(await fetchYoutubeComments(artistId, artistName)));
      platformStatus = `YouTube: ${comments.length} found`;
    } catch (err) {
      platformStatus = `YouTube: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const supabase = createServiceRoleClient();

  if (!comments.length) {
    console.error(`refreshSocialListeningForArtist: no comments found for ${artistName}: ${platformStatus}`);

    const { error: upsertError } = await supabase.from("social_comment_map").upsert({
      artist_id: artistId,
      categories: [],
      comment_count: 0,
      last_error: platformStatus,
      computed_at: new Date().toISOString(),
    });
    if (upsertError) {
      // A schema mismatch here (e.g. a migration never having been applied)
      // would otherwise fail completely silently — the row never gets
      // written at all, so the page keeps showing stale/no data forever
      // with nothing pointing at why.
      console.error(`refreshSocialListeningForArtist: failed to save empty result for ${artistName}:`, upsertError);
      throw new Error(`social_comment_map upsert failed: ${upsertError.message}`);
    }
    return 0;
  }

  const trimmed = comments.slice(0, MAX_COMMENTS);

  // Local keyword matching (see commentCategorizer.ts) always places every
  // comment somewhere — real category or a flat fallback bucket — so unlike
  // the old Gemini-based pass, there's no failure mode here that can make
  // real comments silently disappear from the map.
  const categories = categorizeCommentsLocally(trimmed);

  const { error } = await supabase.from("social_comment_map").upsert({
    artist_id: artistId,
    categories,
    comment_count: trimmed.length,
    last_error: platformStatus,
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
