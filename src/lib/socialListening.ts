import { Type } from "@google/genai";
import { generateContentThrottled } from "@/lib/gemini";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { categorizeCommentsLocally } from "@/lib/commentCategorizer";
import type { SocialComment } from "@/lib/database.types";

const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours — heavier than a simple mentions fetch
const MAX_COMMENTS = 1000;
// Below this many real comments found, an artist is sparse enough (a new
// or niche act YouTube's own search just doesn't have much on) to be worth
// spending a Gemini web sweep on — see refreshSocialListeningForArtist's
// webSweepIfSparse option.
const SPARSE_THRESHOLD = 15;
const WEB_SWEEP_MAX_COMMENTS = 100;

const WEB_MENTIONS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    comments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          author: { type: Type.STRING },
          source: { type: Type.STRING },
          context: { type: Type.STRING },
          url: { type: Type.STRING },
        },
        required: ["text"],
      },
    },
  },
  required: ["comments"],
};

type ExtractedWebComment = {
  text?: string;
  author?: string;
  source?: string;
  context?: string;
  url?: string;
};

function safeParseJson(text: string | undefined): Record<string, unknown> {
  try {
    return JSON.parse(text ?? "{}");
  } catch {
    return {};
  }
}

/** For an artist with genuinely little else to show (a new or niche act —
 * YouTube search alone often doesn't have much), spends one Gemini web
 * sweep looking more broadly: Reddit, X, forums, blogs, wherever real
 * discussion actually exists. Same two-step shape as events.ts's tour-date
 * discovery — a free-text research pass via Google Search grounding, then
 * structured extraction from that — and the same honesty requirement:
 * quote real text with real search evidence behind it, never summarize or
 * invent, and say so plainly if nothing turns up. Only worth doing once at
 * creation (see the webSweepIfSparse option below), not on every refresh —
 * this is exactly the Gemini call that used to make social listening
 * routinely blow the (then-20-requests/day) quota; that ceiling is now
 * ~900-1,000/day for gemini-2.5-flash-lite (see gemini.ts), so it's back,
 * gated to only the cases that actually need it. */
async function fetchWebMentionsViaGemini(artistName: string): Promise<SocialComment[]> {
  const searchRes = await generateContentThrottled({
    model: "gemini-2.5-flash-lite",
    contents:
      `Search the web for real discussion, comments, or posts about the musical artist "${artistName}" — ` +
      "Reddit threads, X/Twitter replies, forum posts, blog comments, anywhere people are genuinely " +
      "discussing them. Find actual text people have posted — quote it verbatim, don't summarize or " +
      "paraphrase — along with who posted it, where it's from, and what the post/thread was about. " +
      "Only report things you have real search evidence for; if you can't find genuine posts, say so " +
      "plainly rather than inventing any.",
    config: { tools: [{ googleSearch: {} }] },
  });
  const digest = searchRes.text ?? "";
  if (!digest.trim()) return [];

  const extractRes = await generateContentThrottled({
    model: "gemini-2.5-flash-lite",
    contents:
      "Extract individual comments/posts from this research into structured data. Each entry needs " +
      "the actual quoted text; skip anything that reads like a summary rather than a real quote, and " +
      `skip duplicates.\n\nResearch:\n${digest}`,
    config: { responseMimeType: "application/json", responseSchema: WEB_MENTIONS_SCHEMA },
  });

  const parsed = safeParseJson(extractRes.text);
  const extracted: ExtractedWebComment[] = Array.isArray(parsed.comments) ? (parsed.comments as ExtractedWebComment[]) : [];

  return extracted
    .filter((c): c is ExtractedWebComment & { text: string } => !!c.text?.trim())
    .slice(0, WEB_SWEEP_MAX_COMMENTS)
    .map((c) => ({
      platform: "web" as const,
      author: c.author?.trim() || "unknown",
      text: c.text!.slice(0, 500),
      score: null,
      url: c.url || `https://www.google.com/search?q=${encodeURIComponent(artistName)}`,
      context: [c.source, c.context].filter(Boolean).join(" — ") || "Web",
      publishedAt: null,
    }));
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

/** Reddit-via-Gemini used to run unconditionally here, until it routinely
 * burned through the whole app's free-tier Gemini quota before anything
 * else that needed Gemini got to run (a hard 20 requests/day at the time —
 * see git history). That ceiling turned out to be stale: gemini-2.5-
 * flash-lite (what every Gemini call in this app actually uses) is
 * ~900-1,000/day, not 20 (see gemini.ts) — real headroom, but a shared
 * project-wide budget still, so this only opts in via webSweepIfSparse
 * (true only from the builder's one-time creation sweep — see
 * provisionActions.ts) rather than running on every repeatable refresh. */
export async function refreshSocialListeningForArtist(
  artistId: string,
  artistName: string,
  opts?: { webSweepIfSparse?: boolean }
) {
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

  if (opts?.webSweepIfSparse && comments.length < SPARSE_THRESHOLD) {
    try {
      const webComments = await fetchWebMentionsViaGemini(artistName);
      comments.push(...webComments);
      platformStatus += ` · Web sweep: ${webComments.length} found`;
    } catch (err) {
      platformStatus += ` · Web sweep: ${err instanceof Error ? err.message : String(err)}`;
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
