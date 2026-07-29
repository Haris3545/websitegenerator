"use server";

import { createClient } from "@/lib/supabase/server";
import { searchGoogleImages, type ImageSearchResult } from "@/lib/googleImageSearch";
import { searchYoutubeVideos, type YoutubeVideoSearchResult } from "@/lib/youtube";

export type SearchResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function searchImagesAction(query: string): Promise<SearchResult<ImageSearchResult[]>> {
  const trimmed = query.trim();
  if (!trimmed) return { ok: true, data: [] };
  try {
    return { ok: true, data: await searchGoogleImages(trimmed) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Image search failed." };
  }
}

export async function searchYoutubeVideosAction(
  query: string
): Promise<SearchResult<YoutubeVideoSearchResult[]>> {
  const trimmed = query.trim();
  if (!trimmed) return { ok: true, data: [] };
  try {
    return { ok: true, data: await searchYoutubeVideos(trimmed) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "YouTube search failed." };
  }
}

const IMPORT_IMAGE_MAX_MB = 25;

/** Downloads a picked search-result image server-side and re-hosts it in
 * artist-media, rather than pointing the site straight at the third-party
 * URL SerpApi returned — that source can disappear, rate-limit, or block
 * hotlinking at any time, and browsers can't fetch arbitrary cross-origin
 * image bytes client-side to compress/upload them the way a pasted file
 * works (that would throw a "tainted canvas" CORS error), so this has to
 * happen server-side regardless. Uses the cookie-bound client (not the
 * service-role one) so the same is_builder_admin() RLS policy that already
 * gates every other builder storage write gates this too. */
export async function importImageFromUrl(
  url: string,
  artistSlug: string,
  slotName: string
): Promise<SearchResult<string>> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("That doesn't look like a valid image URL.");
    }

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; websitegenerator-image-import/1.0)" },
    });
    if (!res.ok) throw new Error(`Couldn't download that image (${res.status}).`);

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      throw new Error("That link doesn't point to an image.");
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > IMPORT_IMAGE_MAX_MB * 1024 * 1024) {
      throw new Error(`Image is too large (over ${IMPORT_IMAGE_MAX_MB}MB).`);
    }

    const ext = contentType.split("/")[1]?.split(";")[0]?.replace("jpeg", "jpg") || "jpg";
    const path = `${artistSlug}/${slotName}.${ext}`;

    const supabase = await createClient();
    const { error: uploadError } = await supabase.storage
      .from("artist-media")
      .upload(path, buffer, { upsert: true, contentType });
    if (uploadError) throw new Error(uploadError.message);

    const { data } = supabase.storage.from("artist-media").getPublicUrl(path);
    // Same cache-busting param MediaUploadField's own upload path uses —
    // the storage path is fixed per slot, so getPublicUrl returns an
    // identical string on every replace without it.
    return { ok: true, data: `${data.publicUrl}?t=${Date.now()}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Import failed." };
  }
}
