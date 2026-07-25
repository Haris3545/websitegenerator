import { createServiceRoleClient } from "@/lib/supabase/server";
import type { YoutubeVideo } from "@/lib/database.types";

const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours

type YoutubeChannelListResponse = {
  items?: {
    snippet?: { title?: string };
    statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string };
  }[];
};

type YoutubeSearchResponse = {
  items?: {
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      publishedAt?: string;
      thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
    };
  }[];
};

export type YoutubeChannelLookup =
  | { ok: true; channelId: string; channelTitle: string }
  | { ok: false; error: string };

type YoutubeChannelLookupResponse = {
  items?: { id?: string; snippet?: { title?: string } }[];
};

type YoutubeVideoLookupResponse = {
  items?: { snippet?: { channelId?: string; channelTitle?: string } }[];
};

type YoutubeChannelSearchResponse = {
  items?: { id?: { channelId?: string }; snippet?: { channelId?: string; title?: string } }[];
};

async function lookupChannelById(id: string, apiKey: string): Promise<YoutubeChannelLookup> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(id)}&key=${apiKey}`
  );
  if (!res.ok) return { ok: false, error: `YouTube API returned ${res.status}.` };
  const data: YoutubeChannelLookupResponse = await res.json();
  const item = data.items?.[0];
  if (!item?.id) return { ok: false, error: "No YouTube channel found for that ID." };
  return { ok: true, channelId: item.id, channelTitle: item.snippet?.title ?? "" };
}

async function lookupChannelByHandle(handle: string, apiKey: string): Promise<YoutubeChannelLookup> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`
  );
  if (!res.ok) return { ok: false, error: `YouTube API returned ${res.status}.` };
  const data: YoutubeChannelLookupResponse = await res.json();
  const item = data.items?.[0];
  if (!item?.id) return { ok: false, error: `No YouTube channel found for @${handle}.` };
  return { ok: true, channelId: item.id, channelTitle: item.snippet?.title ?? "" };
}

async function lookupChannelByUsername(username: string, apiKey: string): Promise<YoutubeChannelLookup> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet&forUsername=${encodeURIComponent(username)}&key=${apiKey}`
  );
  if (!res.ok) return { ok: false, error: `YouTube API returned ${res.status}.` };
  const data: YoutubeChannelLookupResponse = await res.json();
  const item = data.items?.[0];
  if (!item?.id) return { ok: false, error: "No YouTube channel found for that username." };
  return { ok: true, channelId: item.id, channelTitle: item.snippet?.title ?? "" };
}

async function lookupChannelByVideoId(videoId: string, apiKey: string): Promise<YoutubeChannelLookup> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${apiKey}`
  );
  if (!res.ok) return { ok: false, error: `YouTube API returned ${res.status}.` };
  const data: YoutubeVideoLookupResponse = await res.json();
  const item = data.items?.[0];
  if (!item?.snippet?.channelId) return { ok: false, error: "No video found at that link." };
  return { ok: true, channelId: item.snippet.channelId, channelTitle: item.snippet.channelTitle ?? "" };
}

async function lookupChannelBySearch(query: string, apiKey: string): Promise<YoutubeChannelLookup> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=channel&maxResults=1&key=${apiKey}`
  );
  if (!res.ok) return { ok: false, error: `YouTube API returned ${res.status}.` };
  const data: YoutubeChannelSearchResponse = await res.json();
  const item = data.items?.[0];
  const channelId = item?.id?.channelId ?? item?.snippet?.channelId;
  if (!channelId) {
    return {
      ok: false,
      error: `Couldn't find a channel matching "${query}" — try pasting the channel's own URL instead.`,
    };
  }
  return { ok: true, channelId, channelTitle: item?.snippet?.title ?? "" };
}

const CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{22}$/;

/** Resolves whatever someone pasted — a channel URL (@handle, /channel/UC…,
 * /c/…, /user/…), a video URL, a bare @handle, or an already-correct channel
 * ID — into the actual channel ID, so the builder never asks anyone to go
 * find and copy that string themselves. */
export async function resolveYoutubeChannel(input: string): Promise<YoutubeChannelLookup> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "YOUTUBE_API_KEY isn't set — ask whoever manages this app's Vercel project to add it.",
    };
  }

  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "Paste a YouTube channel or video link first." };

  if (CHANNEL_ID_RE.test(trimmed)) return lookupChannelById(trimmed, apiKey);

  let path = trimmed;
  try {
    const url = new URL(/^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`);
    path = url.pathname;

    if (/youtu\.be$/i.test(url.hostname)) {
      return lookupChannelByVideoId(path.replace(/^\//, ""), apiKey);
    }
    const videoId = url.searchParams.get("v");
    if (videoId) return lookupChannelByVideoId(videoId, apiKey);
  } catch {
    // Not a URL — treat it as a bare handle or channel name below.
  }

  const channelMatch = path.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
  if (channelMatch) return lookupChannelById(channelMatch[1], apiKey);

  const handleMatch = path.match(/\/@([\w.-]+)/);
  if (handleMatch) return lookupChannelByHandle(handleMatch[1], apiKey);
  if (trimmed.startsWith("@")) return lookupChannelByHandle(trimmed.slice(1), apiKey);

  const userMatch = path.match(/\/user\/([\w-]+)/);
  if (userMatch) return lookupChannelByUsername(userMatch[1], apiKey);

  const customMatch = path.match(/\/c\/([\w-]+)/);
  return lookupChannelBySearch(customMatch ? customMatch[1] : trimmed, apiKey);
}

export async function refreshYoutubeStats(artistId: string, channelId: string) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY isn't set — ask whoever manages this app's Vercel project to add it.");
  }

  const channelRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${encodeURIComponent(channelId)}&key=${apiKey}`
  );
  if (!channelRes.ok) throw new Error(`YouTube channels API returned ${channelRes.status}`);
  const channelData: YoutubeChannelListResponse = await channelRes.json();
  const channel = channelData.items?.[0];
  if (!channel) throw new Error(`No YouTube channel found for id "${channelId}".`);

  const videosRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channelId)}&order=date&maxResults=10&type=video&key=${apiKey}`
  );
  if (!videosRes.ok) throw new Error(`YouTube search API returned ${videosRes.status}`);
  const videosData: YoutubeSearchResponse = await videosRes.json();

  const recentVideos: YoutubeVideo[] = (videosData.items ?? [])
    .filter((item) => item.id?.videoId)
    .map((item) => ({
      id: item.id!.videoId as string,
      title: item.snippet?.title ?? "",
      publishedAt: item.snippet?.publishedAt ?? "",
      thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? "",
    }));

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("youtube_stats").upsert({
    artist_id: artistId,
    channel_title: channel.snippet?.title ?? null,
    subscriber_count: channel.statistics?.subscriberCount
      ? Number(channel.statistics.subscriberCount)
      : null,
    view_count: channel.statistics?.viewCount ? Number(channel.statistics.viewCount) : null,
    video_count: channel.statistics?.videoCount ? Number(channel.statistics.videoCount) : null,
    recent_videos: recentVideos,
    fetched_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function refreshYoutubeIfStale(artistId: string, channelId: string | null) {
  if (!channelId) return;

  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("youtube_stats")
    .select("fetched_at")
    .eq("artist_id", artistId)
    .maybeSingle();

  const isStale =
    !data?.fetched_at || Date.now() - new Date(data.fetched_at).getTime() > STALE_AFTER_MS;
  if (!isStale) return;

  try {
    await refreshYoutubeStats(artistId, channelId);
  } catch (err) {
    console.error(`refreshYoutubeIfStale failed for artist ${artistId}:`, err);
  }
}
