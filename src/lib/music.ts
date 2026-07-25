import { createServiceRoleClient } from "@/lib/supabase/server";
import type { MusicTopTrack, MusicAlbum } from "@/lib/database.types";

const STALE_AFTER_MS = 12 * 60 * 60 * 1000; // 12 hours
const ALBUM_COUNT = 12;

type LastfmArtistInfoResponse = {
  artist?: {
    stats?: { listeners?: string; playcount?: string };
    tags?: { tag?: { name?: string }[] | { name?: string } };
  };
};

type LastfmTopTracksResponse = {
  toptracks?: {
    track?: { name?: string; playcount?: string; listeners?: string; url?: string }[];
  };
};

type LastfmTopAlbumsResponse = {
  topalbums?: {
    album?: { name?: string; playcount?: string; url?: string }[];
  };
};

type ItunesSearchResponse = {
  results?: { artworkUrl100?: string }[];
};

/** Last.fm's own album artwork URLs have been broken placeholder images for
 * years (a long-standing, widely-reported issue on their end) — so real
 * cover art comes from Apple's iTunes Search API instead, which is free,
 * keyless, and actually reliable for this. artworkUrl100 is swapped for a
 * larger size using iTunes's well-known URL-suffix convention. */
async function fetchAlbumArtwork(artistName: string, albumName: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(`${artistName} ${albumName}`)}&entity=album&limit=1`
    );
    if (!res.ok) return null;
    const data: ItunesSearchResponse = await res.json();
    const artwork = data.results?.[0]?.artworkUrl100;
    return artwork ? artwork.replace("100x100", "600x600") : null;
  } catch {
    return null;
  }
}

export async function refreshMusicStats(artistId: string, artistName: string) {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    throw new Error("LASTFM_API_KEY isn't set — ask whoever manages this app's Vercel project to add it.");
  }

  const infoRes = await fetch(
    `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(artistName)}&api_key=${apiKey}&format=json`
  );
  if (!infoRes.ok) throw new Error(`Last.fm artist.getinfo returned ${infoRes.status}`);
  const infoData: LastfmArtistInfoResponse = await infoRes.json();
  if (!infoData.artist) throw new Error(`No Last.fm artist found for "${artistName}".`);

  const rawTags = infoData.artist.tags?.tag;
  const tags = Array.isArray(rawTags) ? rawTags : rawTags ? [rawTags] : [];
  const topTags = tags.map((t) => t.name).filter((n): n is string => !!n).slice(0, 8);

  const tracksRes = await fetch(
    `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(artistName)}&api_key=${apiKey}&format=json&limit=10`
  );
  if (!tracksRes.ok) throw new Error(`Last.fm artist.gettoptracks returned ${tracksRes.status}`);
  const tracksData: LastfmTopTracksResponse = await tracksRes.json();
  const rawTracks = tracksData.toptracks?.track;
  const trackList = Array.isArray(rawTracks) ? rawTracks : rawTracks ? [rawTracks] : [];

  const topTracks: MusicTopTrack[] = trackList
    .filter((t) => t.name)
    .map((t) => ({
      name: t.name as string,
      playcount: t.playcount ? Number(t.playcount) : null,
      listeners: t.listeners ? Number(t.listeners) : null,
      url: t.url ?? "",
    }));

  const albumsRes = await fetch(
    `https://ws.audioscrobbler.com/2.0/?method=artist.gettopalbums&artist=${encodeURIComponent(artistName)}&api_key=${apiKey}&format=json&limit=${ALBUM_COUNT}`
  );
  if (!albumsRes.ok) throw new Error(`Last.fm artist.gettopalbums returned ${albumsRes.status}`);
  const albumsData: LastfmTopAlbumsResponse = await albumsRes.json();
  const rawAlbums = albumsData.topalbums?.album;
  const albumList = (Array.isArray(rawAlbums) ? rawAlbums : rawAlbums ? [rawAlbums] : [])
    .filter((a) => a.name)
    .slice(0, ALBUM_COUNT);

  const topAlbums: MusicAlbum[] = await Promise.all(
    albumList.map(async (a) => ({
      name: a.name as string,
      playcount: a.playcount ? Number(a.playcount) : null,
      url: a.url ?? "",
      artworkUrl: await fetchAlbumArtwork(artistName, a.name as string),
    }))
  );

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("music_stats").upsert({
    artist_id: artistId,
    listeners: infoData.artist.stats?.listeners ? Number(infoData.artist.stats.listeners) : null,
    playcount: infoData.artist.stats?.playcount ? Number(infoData.artist.stats.playcount) : null,
    top_tags: topTags,
    top_tracks: topTracks,
    top_albums: topAlbums,
    fetched_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function refreshMusicIfStale(artistId: string, artistName: string) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("music_stats")
    .select("fetched_at")
    .eq("artist_id", artistId)
    .maybeSingle();

  const isStale =
    !data?.fetched_at || Date.now() - new Date(data.fetched_at).getTime() > STALE_AFTER_MS;
  if (!isStale) return;

  try {
    await refreshMusicStats(artistId, artistName);
  } catch (err) {
    console.error(`refreshMusicIfStale failed for artist ${artistId}:`, err);
  }
}
