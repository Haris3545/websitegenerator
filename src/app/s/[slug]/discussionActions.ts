"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { searchGiphy, type GifResult } from "@/lib/giphy";
import type { DiscussionPost } from "@/lib/database.types";

export async function searchGifsAction(
  query: string
): Promise<{ ok: true; data: GifResult[] } | { ok: false; error: string }> {
  const trimmed = query.trim();
  if (!trimmed) return { ok: true, data: [] };
  try {
    return { ok: true, data: await searchGiphy(trimmed) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "GIF search failed." };
  }
}

/** Uploads a Discussion post's attached image server-side, same reasoning
 * as addManualEvent's image upload in actions.ts — this runs from the live
 * site itself, gated only by the artist's password cookie, not a real
 * Supabase Auth session, so it can't use storage's usual authenticated
 * client-side upload path. */
export async function uploadDiscussionImage(
  artistSlug: string,
  formData: FormData
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No file provided." };

  const supabase = createServiceRoleClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${artistSlug}/discussion/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from("artist-media")
    .upload(path, buffer, { contentType: file.type, cacheControl: "31536000" });
  if (error) return { ok: false, error: error.message };

  const { data } = supabase.storage.from("artist-media").getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

/** Same idea as the builder's importImageFromUrl (searchActions.ts) — a
 * picked Google Images search result gets downloaded and re-hosted here
 * rather than hotlinked, since the third-party source can disappear or
 * block hotlinking at any time. Uses the service-role client (not the
 * authenticated builder client that one uses) since this runs from the
 * live site itself, gated only by the artist's password cookie. No size
 * preference here (unlike the builder's own picker) — any search result
 * is fine for a Discussion post attachment. */
export async function importDiscussionImageFromUrl(
  url: string,
  artistSlug: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
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
    const ext = contentType.split("/")[1]?.split(";")[0]?.replace("jpeg", "jpg") || "jpg";
    const path = `${artistSlug}/discussion/${crypto.randomUUID()}.${ext}`;

    const supabase = createServiceRoleClient();
    const { error } = await supabase.storage
      .from("artist-media")
      .upload(path, buffer, { contentType, cacheControl: "31536000" });
    if (error) throw new Error(error.message);

    const { data } = supabase.storage.from("artist-media").getPublicUrl(path);
    return { ok: true, url: data.publicUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Import failed." };
  }
}

/** Every visitor is just a typed-once display name (see DiscussionBoard's
 * localStorage prompt) — there's no real per-visitor login on this site, so
 * author_name isn't an authenticated identity, just a courtesy label.
 * parentId set means this is a reply to another post rather than a new
 * top-level one — one level of nesting only (a reply's own parentId is
 * always the top-level post, never another reply). */
export async function addDiscussionPost(
  artistId: string,
  authorName: string,
  body: string,
  imageUrl: string | null,
  gifUrl: string | null,
  parentId: string | null = null
): Promise<{ ok: true; post: DiscussionPost } | { ok: false; error: string }> {
  if (!authorName.trim()) return { ok: false, error: "Name can't be empty." };
  if (!body.trim() && !imageUrl && !gifUrl) return { ok: false, error: "Post can't be empty." };

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("discussion_posts")
    .insert({
      artist_id: artistId,
      author_name: authorName.trim(),
      body: body.trim(),
      image_url: imageUrl,
      gif_url: gifUrl,
      parent_id: parentId,
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/s/[slug]`, "layout");
  return { ok: true, post: data };
}

export async function deleteDiscussionPost(id: string) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("discussion_posts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/s/[slug]`, "layout");
}

/** Toggles a reaction on/off for (post, author, kind) rather than always
 * inserting — clicking the same reaction twice removes it instead of
 * stacking duplicate rows, which is the closest this shared-password site
 * can get to "unlike" without any real per-visitor account to check
 * against. */
export async function toggleDiscussionReaction(
  postId: string,
  authorName: string,
  kind: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createServiceRoleClient();
  const { data: existing } = await supabase
    .from("discussion_reactions")
    .select("id")
    .eq("post_id", postId)
    .eq("author_name", authorName)
    .eq("kind", kind)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("discussion_reactions").delete().eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("discussion_reactions")
      .insert({ post_id: postId, author_name: authorName, kind });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/s/[slug]`, "layout");
  return { ok: true };
}
