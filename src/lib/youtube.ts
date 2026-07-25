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
