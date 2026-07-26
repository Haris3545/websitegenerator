import { createServiceRoleClient } from "@/lib/supabase/server";
import type { GeniusAnnotation } from "@/lib/database.types";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours — lyric annotations barely change day to day
const SONGS_TO_CHECK = 5;
const ANNOTATIONS_PER_SONG = 4;

type GeniusSearchHit = {
  result?: { id?: number; title?: string; url?: string; primary_artist?: { id?: number; name?: string } };
};
type GeniusSearchResponse = { response?: { hits?: GeniusSearchHit[] } };

type GeniusSong = { id?: number; title?: string; url?: string };
type GeniusArtistSongsResponse = { response?: { songs?: GeniusSong[] } };

type GeniusReferent = {
  fragment?: string;
  annotations?: { body?: { plain?: string }; votes_total?: number }[];
};
type GeniusReferentsResponse = { response?: { referents?: GeniusReferent[] } };

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function geniusFetch<T>(path: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(`https://api.genius.com${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Resolves an artist name to their Genius artist ID via search, matching
 * on the primary_artist of the top hits rather than trusting the very
 * first result (a cover or a feature can outrank the real artist page). */
async function resolveGeniusArtistId(artistName: string, token: string): Promise<number | null> {
  const data = await geniusFetch<GeniusSearchResponse>(
    `/search?q=${encodeURIComponent(artistName)}`,
    token
  );
  const hits = data?.response?.hits ?? [];
  const wanted = normalizeForMatch(artistName);
  const match = hits.find((h) => {
    const name = h.result?.primary_artist?.name;
    return name && normalizeForMatch(name) === wanted;
  });
  return match?.result?.primary_artist?.id ?? hits[0]?.result?.primary_artist?.id ?? null;
}

/** Pulls a handful of fan-submitted lyric annotations (Genius's "what does
 * this line mean" community text) across the artist's most popular songs —
 * both for its own "Lyrics & fan annotations" card on the Music tab, and as
 * extra raw text fed into the Social listening word cloud/themes corpus
 * (see conversationThemes.ts), since annotation discussion is a source
 * none of the other integrations (YouTube, Reddit, press, Wikipedia)
 * capture at all. */
async function fetchGeniusAnnotations(artistName: string, token: string): Promise<GeniusAnnotation[]> {
  const artistId = await resolveGeniusArtistId(artistName, token);
  if (!artistId) return [];

  const songsData = await geniusFetch<GeniusArtistSongsResponse>(
    `/artists/${artistId}/songs?sort=popularity&per_page=${SONGS_TO_CHECK}`,
    token
  );
  const songs = (songsData?.response?.songs ?? []).filter((s) => s.id && s.title);

  const perSong = await Promise.all(
    songs.map(async (song) => {
      const referentsData = await geniusFetch<GeniusReferentsResponse>(
        `/referents?song_id=${song.id}&text_format=plain&per_page=${ANNOTATIONS_PER_SONG}`,
        token
      );
      const referents = referentsData?.response?.referents ?? [];
      return referents
        .map((r): GeniusAnnotation | null => {
          const body = r.annotations?.[0]?.body?.plain?.trim();
          if (!r.fragment || !body) return null;
          return {
            songTitle: song.title as string,
            songUrl: song.url ?? "",
            fragment: r.fragment.trim(),
            annotation: body,
            votes: r.annotations?.[0]?.votes_total ?? 0,
          };
        })
        .filter((a): a is GeniusAnnotation => a !== null);
    })
  );

  return perSong.flat().sort((a, b) => b.votes - a.votes);
}

export async function refreshGeniusAnnotations(
  artistId: string,
  artistName: string
): Promise<GeniusAnnotation[]> {
  const token = process.env.GENIUS_ACCESS_TOKEN;
  if (!token) {
    throw new Error("GENIUS_ACCESS_TOKEN isn't set — ask whoever manages this app's Vercel project to add it.");
  }

  const annotations = await fetchGeniusAnnotations(artistName, token);

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("genius_annotations").upsert({
    artist_id: artistId,
    annotations,
    computed_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  return annotations;
}

export async function refreshGeniusAnnotationsIfStale(artistId: string, artistName: string) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("genius_annotations")
    .select("computed_at")
    .eq("artist_id", artistId)
    .maybeSingle();

  const isStale =
    !data?.computed_at || Date.now() - new Date(data.computed_at).getTime() > STALE_AFTER_MS;
  if (!isStale) return;

  try {
    await refreshGeniusAnnotations(artistId, artistName);
  } catch (err) {
    console.error(`refreshGeniusAnnotationsIfStale failed for artist ${artistId}:`, err);
  }
}
