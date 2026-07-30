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

type DeezerArtistSearchResponse = {
  data?: { id?: number; name?: string }[];
};

type DeezerAlbum = {
  title?: string;
  cover_medium?: string;
  cover_big?: string;
  cover_xl?: string;
  release_date?: string;
  record_type?: string;
  link?: string;
};

type DeezerArtistAlbumsResponse = {
  data?: DeezerAlbum[];
};

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Names typed/pasted from elsewhere (e.g. a curly ' pulled off a web page)
// don't always match Last.fm's own straight-apostrophe spelling even with
// autocorrect=1 — "Barry Can’t Swim" (curly ’) fails to resolve even though
// "Barry Can't Swim" (straight ') is exactly how Last.fm has the artist.
function normalizeApostrophes(s: string): string {
  return s.replace(/[‘’‚‛`´]/g, "'");
}

// artist.search is far more forgiving of near-miss spelling/punctuation
// than artist.getinfo's own autocorrect — resolving to Last.fm's canonical
// name here first means getinfo/gettoptracks below are far less likely to
// come back empty for an artist that genuinely has a Last.fm page.
async function resolveLastfmArtistName(rawName: string, apiKey: string): Promise<string> {
  const name = normalizeApostrophes(rawName);
  try {
    const res = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=artist.search&artist=${encodeURIComponent(name)}&api_key=${apiKey}&format=json&limit=1`
    );
    if (!res.ok) return name;
    const data: { results?: { artistmatches?: { artist?: { name?: string }[] | { name?: string } } } } =
      await res.json();
    const raw = data.results?.artistmatches?.artist;
    const first = Array.isArray(raw) ? raw[0] : raw;
    return first?.name ?? name;
  } catch {
    return name;
  }
}

/** Last.fm's own album artwork has been broken placeholder images for years,
 * and its "top albums" ranking is popularity-based, so brand-new releases
 * lag behind. Deezer's public API (genuinely keyless, no registration)
 * fixes both: resolve the artist to their exact Deezer artist ID once, then
 * pull albums directly from that artist's own catalog — the artwork is
 * then guaranteed to belong to the right artist (no cross-catalog
 * guessing), and sorting by release_date surfaces new albums immediately. */
async function fetchDeezerAlbums(artistName: string): Promise<MusicAlbum[]> {
  try {
    const searchRes = await fetch(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=5`
    );
    if (!searchRes.ok) return [];
    const searchData: DeezerArtistSearchResponse = await searchRes.json();

    const wanted = normalizeForMatch(artistName);
    const candidates = searchData.data ?? [];
    const match =
      candidates.find((a) => a.name && normalizeForMatch(a.name) === wanted) ?? candidates[0];
    if (!match?.id) return [];

    const albumsRes = await fetch(`https://api.deezer.com/artist/${match.id}/albums?limit=30`);
    if (!albumsRes.ok) return [];
    const albumsData: DeezerArtistAlbumsResponse = await albumsRes.json();
    const rawAlbums = albumsData.data ?? [];

    const realAlbums = rawAlbums.filter((a) => a.record_type === "album");
    const pool = realAlbums.length >= 3 ? realAlbums : rawAlbums;

    return pool
      .filter((a) => a.title)
      .sort((a, b) => (b.release_date ?? "").localeCompare(a.release_date ?? ""))
      .slice(0, ALBUM_COUNT)
      .map((a) => ({
        name: a.title as string,
        playcount: null,
        url: a.link ?? "",
        artworkUrl: a.cover_xl ?? a.cover_big ?? a.cover_medium ?? null,
      }));
  } catch {
    return [];
  }
}

export async function refreshMusicStats(artistId: string, artistName: string) {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    throw new Error("LASTFM_API_KEY isn't set — ask whoever manages this app's Vercel project to add it.");
  }

  // Resolved to Last.fm's own canonical spelling first (see
  // resolveLastfmArtistName) — autocorrect=1 below still helps with
  // straightforward typos, but doesn't reliably fix punctuation mismatches
  // like a curly apostrophe on its own.
  const resolvedName = await resolveLastfmArtistName(artistName, apiKey);

  const infoRes = await fetch(
    `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(resolvedName)}&autocorrect=1&api_key=${apiKey}&format=json`
  );
  if (!infoRes.ok) throw new Error(`Last.fm artist.getinfo returned ${infoRes.status}`);
  const infoData: LastfmArtistInfoResponse = await infoRes.json();
  if (!infoData.artist) throw new Error(`No Last.fm artist found for "${artistName}".`);

  const rawTags = infoData.artist.tags?.tag;
  const tags = Array.isArray(rawTags) ? rawTags : rawTags ? [rawTags] : [];
  const topTags = tags.map((t) => t.name).filter((n): n is string => !!n).slice(0, 8);

  const tracksRes = await fetch(
    `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(resolvedName)}&autocorrect=1&api_key=${apiKey}&format=json&limit=10`
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

  const topAlbums = await fetchDeezerAlbums(artistName);

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
