"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { refreshMediaForArtist } from "@/lib/media";
import { refreshTicketmasterEventsOnly } from "@/lib/events";
import { refreshYoutubeStats } from "@/lib/youtube";
import { refreshSocialListeningForArtist } from "@/lib/socialListening";
import { refreshMusicStats } from "@/lib/music";
import { refreshWikipediaTrendsNow } from "@/lib/wikipedia";
import { refreshGeniusAnnotations } from "@/lib/genius";
import { refreshConversationThemesForArtist } from "@/lib/conversationThemes";
import { computeArtistPassword, artistAccessCookieName } from "@/lib/artistAccess";
import { artistCacheTag } from "@/lib/getSiteArtist";
import { ALL_TAB_KEYS } from "@/lib/tabs";
import type { ThemeOverrides } from "@/lib/theme";
import type { AestheticParams, SentimentFilter, BoardItem, TabKey, ArtistEvent } from "@/lib/database.types";

/** Deliberately excludes anything that calls Gemini (sentiment analysis,
 * dashboard insights, the web-search half of tour-date discovery) and the
 * SerpApi-backed search trends — both have tight external quotas (Gemini's
 * free daily tier; SerpApi's 250 searches/month), so a button anyone can
 * click repeatedly across every artist must never be what burns through
 * them. Those three still refresh on their own schedule when someone
 * actually visits the tab that shows them (see each tab's own
 * refresh*IfStale call) — this button only covers sources with no such
 * quota risk. Running them concurrently (rather than the old sequential
 * approach) caps the wall-clock time at the slowest single step instead of
 * their sum, which is what used to blow past Vercel's serverless timeout. */
const STEP_LABELS = [
  "media", "ticketmaster events", "youtube", "social listening", "music", "genius",
] as const;

export async function refreshEverything(slug: string) {
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("id, name, youtube_channel_id")
    .eq("slug", slug)
    .single();

  if (!artist) return;

  const results = await Promise.allSettled([
    refreshMediaForArtist(artist.id, artist.name),
    refreshTicketmasterEventsOnly(artist.id, artist.name),
    artist.youtube_channel_id
      ? refreshYoutubeStats(artist.id, artist.youtube_channel_id)
      : Promise.resolve(),
    refreshSocialListeningForArtist(artist.id, artist.name),
    refreshMusicStats(artist.id, artist.name),
    refreshGeniusAnnotations(artist.id, artist.name),
  ]);

  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`refreshEverything: ${STEP_LABELS[i]} refresh failed for ${slug}:`, result.reason);
    }
  });

  // Wikipedia trends reads the just-refreshed album list, so it has to run
  // after music_stats above rather than in the same batch.
  const { data: musicRow } = await supabase
    .from("music_stats")
    .select("top_albums")
    .eq("artist_id", artist.id)
    .maybeSingle();

  try {
    await refreshWikipediaTrendsNow(artist.id, artist.name, (musicRow?.top_albums ?? []).map((a) => a.name));
  } catch (err) {
    console.error(`refreshEverything: Wikipedia trends refresh failed for ${slug}:`, err);
  }

  // Reads across Wikipedia trends, social_comment_map, and Genius
  // annotations, all only just refreshed above, so it has to run after —
  // never in parallel with them. Not Gemini-based (see conversationThemes.ts).
  try {
    await refreshConversationThemesForArtist(artist.id, artist.name);
  } catch (err) {
    console.error(`refreshEverything: conversation themes refresh failed for ${slug}:`, err);
  }

  updateTag(artistCacheTag(slug));
  revalidatePath(`/s/${slug}`, "layout");
}

/** Saves manually-edited filter definitions from the Dashboard tab's filter
 * editor. These survive future sentiment recomputes (see
 * refreshSentimentNow) since a human redefining what a filter means should
 * stick until they change it again, not get silently overwritten. */
export async function updateSentimentFilters(artistId: string, filters: SentimentFilter[]) {
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("slug, sentiment_summary")
    .eq("id", artistId)
    .maybeSingle();

  await supabase
    .from("artists")
    .update({
      sentiment_summary: { ...artist?.sentiment_summary, filters },
    })
    .eq("id", artistId);

  if (artist?.slug) updateTag(artistCacheTag(artist.slug));
  revalidatePath(`/s/[slug]`, "layout");
}

/** Saves a right-click edit to a piece of static site copy (see
 * Editable.tsx). An empty/blank value clears the override, reverting to
 * whatever's baked into the component. */
export async function updateContentOverride(artistId: string, key: string, value: string) {
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("slug, content_overrides")
    .eq("id", artistId)
    .maybeSingle();

  const next = { ...(artist?.content_overrides ?? {}) };
  const trimmed = value.trim();
  if (trimmed) {
    next[key] = trimmed;
  } else {
    delete next[key];
  }

  await supabase.from("artists").update({ content_overrides: next }).eq("id", artistId);
  if (artist?.slug) updateTag(artistCacheTag(artist.slug));
  revalidatePath(`/s/[slug]`, "layout");
}

/** Saves a drag-reorder or a tab/card removal made directly on the live
 * site in edit mode (see NavPills and DashboardKpiGrid) — the nav pills
 * and the Dashboard's KPI cards are both just different renderings of this
 * one enabled_tabs array, so reordering or removing either one updates the
 * same underlying, permanently-persisted list. "dashboard" is filtered out
 * defensively even though the UI never lets it be dragged/removed — it's
 * always force-included as tab order's fixed first entry. */
export async function updateTabOrder(artistId: string, orderedTabs: TabKey[]) {
  const validTabs = orderedTabs.filter((t) => ALL_TAB_KEYS.includes(t) && t !== "dashboard");
  const enabled_tabs: TabKey[] = ["dashboard", ...validTabs];

  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase.from("artists").select("slug").eq("id", artistId).maybeSingle();

  await supabase.from("artists").update({ enabled_tabs }).eq("id", artistId);
  if (artist?.slug) updateTag(artistCacheTag(artist.slug));
  revalidatePath(`/s/[slug]`, "layout");
}

/** Same drag-reorder-then-persist shape as updateTabOrder, but for the
 * Dashboard's own content sections ("What we've noticed", Wikipedia
 * pageviews, "Most relevant coverage") rather than the tab bar/KPI cards. */
export async function updateDashboardSectionOrder(artistId: string, order: string[]) {
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase.from("artists").select("slug").eq("id", artistId).maybeSingle();

  await supabase.from("artists").update({ dashboard_section_order: order }).eq("id", artistId);
  if (artist?.slug) updateTag(artistCacheTag(artist.slug));
  revalidatePath(`/s/[slug]`, "layout");
}

/** Same shape again, but for the YouTube tab's own sections ("Comment
 * themes", "Channel stats") — lets a visitor drag "Comment themes" to the
 * top themselves instead of it being a fixed order. */
export async function updateYoutubeSectionOrder(artistId: string, order: string[]) {
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase.from("artists").select("slug").eq("id", artistId).maybeSingle();

  await supabase.from("artists").update({ youtube_section_order: order }).eq("id", artistId);
  if (artist?.slug) updateTag(artistCacheTag(artist.slug));
  revalidatePath(`/s/[slug]`, "layout");
}

/** Persists the quick aesthetic tweaks made from the on-site edit-mode panel
 * (see AestheticPanel) — colours, font, and the card look knobs the builder's
 * own ThemeEditor also exposes. Deeper background-image adjustments (pan/
 * zoom/contrast) stay in the builder's dedicated editor, where there's room
 * for a real preview to drag against. */
export async function updateArtistAesthetics(
  artistId: string,
  aesthetics: {
    primary_color: string;
    accent_color: string;
    font_family: string;
    theme_overrides: ThemeOverrides;
    aesthetic_params: AestheticParams;
  }
) {
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase.from("artists").select("slug").eq("id", artistId).maybeSingle();

  await supabase
    .from("artists")
    .update({
      primary_color: aesthetics.primary_color,
      accent_color: aesthetics.accent_color,
      font_family: aesthetics.font_family,
      theme_overrides: aesthetics.theme_overrides,
      aesthetic_params: aesthetics.aesthetic_params,
    })
    .eq("id", artistId);
  if (artist?.slug) updateTag(artistCacheTag(artist.slug));
  revalidatePath(`/s/[slug]`, "layout");
}

/** Checks the password entered on /s/[slug]/gate against the artist's
 * name-derived password and, on success, sets a long-lived cookie that
 * grants read access to the site (see middleware.ts). Data on the generated
 * site is fetched with the service-role client rather than gated by
 * Supabase Auth/RLS, since this cookie — not a real user session — is what
 * authorizes the visitor from here on. */
export async function verifyArtistAccess(
  slug: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceRoleClient();
  const { data: artist, error } = await supabase
    .from("artists")
    .select("slug")
    .eq("slug", slug)
    .maybeSingle();

  if (error) return { ok: false, error: `Artist lookup failed: ${error.message}` };
  if (!artist) return { ok: false, error: `No artist found for slug "${slug}".` };

  if (password.trim().toLowerCase() !== computeArtistPassword(artist.slug)) {
    return { ok: false };
  }

  const cookieStore = await cookies();
  cookieStore.set(artistAccessCookieName(slug), "granted", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });

  redirect(`/s/${slug}`);
}

/** Clears the artist-name password cookie and sends the visitor back to
 * the gate page — the only way back to it once you're past it, since the
 * cookie otherwise lasts 180 days. */
export async function logOutOfArtistSite(slug: string) {
  const cookieStore = await cookies();
  cookieStore.delete(artistAccessCookieName(slug));
  redirect(`/s/${slug}/gate`);
}

/** Adds a card to one of the Strategy/Tactics/Ideas/Research boards. */
export async function addBoardItem(
  artistId: string,
  boardKey: string,
  title: string,
  body: string
): Promise<{ ok: true; item: BoardItem } | { ok: false; error: string }> {
  if (!title.trim()) return { ok: false, error: "Title can't be empty." };

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("board_items")
    .insert({ artist_id: artistId, board_key: boardKey, title: title.trim(), body: body.trim() })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/s/[slug]`, "layout");
  return { ok: true, item: data };
}

export async function deleteBoardItem(itemId: string) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("board_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath(`/s/[slug]`, "layout");
}

/** Adds a manually-created Calendar event — the "+" flow, for dates a
 * ticketing API or web search wouldn't know about (a fan meetup, a private
 * session, anything not publicly listed). Uploads the optional image
 * server-side with the service-role client rather than the usual
 * client-side upload MediaUploadField.tsx uses, since that path requires
 * an authenticated builder admin per storage.objects' RLS policy — this
 * runs from the live site itself, gated only by the artist's password
 * cookie, not a Supabase Auth session. */
export async function addManualEvent(
  artistId: string,
  slug: string,
  formData: FormData
): Promise<{ ok: true; event: ArtistEvent } | { ok: false; error: string }> {
  const venue = String(formData.get("venue") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const file = formData.get("image");

  if (!venue) return { ok: false, error: "Venue is required." };
  if (!date) return { ok: false, error: "Date is required." };

  const eventDate = new Date(`${date}T${time || "00:00"}:00`);
  if (Number.isNaN(eventDate.getTime())) return { ok: false, error: "That date/time isn't valid." };

  const supabase = createServiceRoleClient();

  let imageUrl: string | null = null;
  if (file instanceof File && file.size > 0) {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${slug}/events/${crypto.randomUUID()}.${ext}`;
    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from("artist-media")
      .upload(path, bytes, { contentType: file.type || "image/jpeg" });
    if (uploadError) return { ok: false, error: `Image upload failed: ${uploadError.message}` };
    const { data: publicUrlData } = supabase.storage.from("artist-media").getPublicUrl(path);
    imageUrl = publicUrlData.publicUrl;
  }

  const { data, error } = await supabase
    .from("artist_events")
    .insert({
      artist_id: artistId,
      event_date: eventDate.toISOString(),
      venue,
      city,
      country,
      description: description || null,
      image_url: imageUrl,
      url: url || null,
      source: "manual",
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };

  updateTag(artistCacheTag(slug));
  revalidatePath(`/s/${slug}/calendar`);
  return { ok: true, event: data };
}

export async function deleteManualEvent(eventId: string, slug: string) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("artist_events").delete().eq("id", eventId).eq("source", "manual");
  if (error) throw new Error(error.message);
  updateTag(artistCacheTag(slug));
  revalidatePath(`/s/${slug}/calendar`);
}

async function uploadIdeaImage(
  supabase: ReturnType<typeof createServiceRoleClient>,
  slug: string,
  file: File
): Promise<{ url: string } | { error: string }> {
  const ext = file.name.split(".").pop() || "webp";
  const path = `${slug}/ideas/${crypto.randomUUID()}.${ext}`;
  const bytes = await file.arrayBuffer();
  const { error } = await supabase.storage
    .from("artist-media")
    .upload(path, bytes, { contentType: file.type || "image/webp" });
  if (error) return { error: `Image upload failed: ${error.message}` };
  const { data } = supabase.storage.from("artist-media").getPublicUrl(path);
  return { url: data.publicUrl };
}

/** Adds a card to the Ideas tab's swipeable stack — like addBoardItem but
 * with the extra image/timeline fields the card UI needs. Uploads the image
 * server-side with the service-role client, mirroring addManualEvent, since
 * this runs from the live site itself (gated only by the artist's password
 * cookie) rather than an authenticated builder session that storage.objects'
 * RLS policy would otherwise require. The client is expected to have already
 * run the file through browser-image-compression before it lands here. */
export async function addIdeaCard(
  artistId: string,
  slug: string,
  formData: FormData
): Promise<{ ok: true; item: BoardItem } | { ok: false; error: string }> {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const timeline = String(formData.get("timeline") ?? "").trim();
  const file = formData.get("image");

  if (!title) return { ok: false, error: "Title can't be empty." };

  const supabase = createServiceRoleClient();

  let imageUrl: string | null = null;
  if (file instanceof File && file.size > 0) {
    const result = await uploadIdeaImage(supabase, slug, file);
    if ("error" in result) return { ok: false, error: result.error };
    imageUrl = result.url;
  }

  const { data, error } = await supabase
    .from("board_items")
    .insert({
      artist_id: artistId,
      board_key: "ideas",
      title,
      body,
      timeline: timeline || null,
      image_url: imageUrl,
      status: "pending",
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  updateTag(artistCacheTag(slug));
  revalidatePath(`/s/${slug}/ideas`);
  return { ok: true, item: data };
}

/** Edits an idea's title/body/timeline and optionally replaces its image —
 * the card-back edit button. */
export async function updateIdeaCard(
  itemId: string,
  slug: string,
  formData: FormData
): Promise<{ ok: true; item: BoardItem } | { ok: false; error: string }> {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const timeline = String(formData.get("timeline") ?? "").trim();
  const file = formData.get("image");

  if (!title) return { ok: false, error: "Title can't be empty." };

  const supabase = createServiceRoleClient();
  const update: { title: string; body: string; timeline: string | null; image_url?: string } = {
    title,
    body,
    timeline: timeline || null,
  };

  if (file instanceof File && file.size > 0) {
    const result = await uploadIdeaImage(supabase, slug, file);
    if ("error" in result) return { ok: false, error: result.error };
    update.image_url = result.url;
  }

  const { data, error } = await supabase.from("board_items").update(update).eq("id", itemId).select().single();
  if (error) return { ok: false, error: error.message };
  updateTag(artistCacheTag(slug));
  revalidatePath(`/s/${slug}/ideas`);
  return { ok: true, item: data };
}

/** Moves one or more ideas between the pending stack and the liked/disliked
 * folders — a swipe result, a bulk "switch to disliked"/"return to stack"
 * from the folder grid's select mode, or an undo. */
export async function updateIdeaStatuses(
  itemIds: string[],
  status: "pending" | "liked" | "disliked",
  slug: string
) {
  if (itemIds.length === 0) return;
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("board_items").update({ status }).in("id", itemIds);
  if (error) throw new Error(error.message);
  updateTag(artistCacheTag(slug));
  revalidatePath(`/s/${slug}/ideas`);
}

/** Deletes an idea card and, if it had been scheduled onto the calendar,
 * the artist_events row that scheduling created too — otherwise that event
 * would be left behind with nothing in the Ideas tab pointing at it. */
export async function deleteIdeaCard(itemId: string, slug: string) {
  const supabase = createServiceRoleClient();
  const { data: item } = await supabase
    .from("board_items")
    .select("calendar_event_id")
    .eq("id", itemId)
    .maybeSingle();

  if (item?.calendar_event_id) {
    await supabase.from("artist_events").delete().eq("id", item.calendar_event_id);
  }

  const { error } = await supabase.from("board_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
  updateTag(artistCacheTag(slug));
  revalidatePath(`/s/${slug}/ideas`);
  revalidatePath(`/s/${slug}/calendar`);
}

/** Builds the artist_events description for an idea-derived event — folds
 * the timeline/lead-time note in underneath the idea's own description
 * (there's no dedicated column for it on artist_events) so clicking the
 * resulting calendar event still surfaces everything the idea card had. */
function ideaEventDescription(body: string, timeline: string | null): string | null {
  const parts = [body.trim(), timeline ? `Timeline / lead time: ${timeline}` : ""].filter(Boolean);
  return parts.length ? parts.join("\n\n") : null;
}

/** "Add to calendar" from the Liked folder (or a drag onto a specific day —
 * see PendingIdeaStack/CalendarBoard). A confirmed date/time creates (or
 * updates) a real artist_events row so the idea shows up on the actual
 * month grid like any other event; ticking "to be confirmed" instead just
 * flags the idea so it shows up in the small pending-confirmation stack at
 * the bottom of the Calendar tab, with no firm date committed yet. Returns
 * the resulting event (or null for the tbc case) so a client component can
 * merge it into an already-rendered calendar without a full refetch. */
export async function scheduleIdeaToCalendar(
  itemId: string,
  artistId: string,
  slug: string,
  input: { date: string; time: string; tbc: boolean }
): Promise<{ ok: true; event: ArtistEvent | null } | { ok: false; error: string }> {
  const supabase = createServiceRoleClient();
  const { data: item, error: fetchError } = await supabase
    .from("board_items")
    .select("title, body, image_url, timeline, calendar_event_id")
    .eq("id", itemId)
    .maybeSingle();
  if (fetchError) return { ok: false, error: fetchError.message };
  if (!item) return { ok: false, error: "Idea not found." };

  if (input.tbc) {
    if (item.calendar_event_id) {
      await supabase.from("artist_events").delete().eq("id", item.calendar_event_id);
    }
    const { error } = await supabase
      .from("board_items")
      .update({
        calendar_status: "tbc",
        scheduled_date: input.date || null,
        scheduled_time: input.time || null,
        calendar_event_id: null,
      })
      .eq("id", itemId);
    if (error) return { ok: false, error: error.message };

    updateTag(artistCacheTag(slug));
    revalidatePath(`/s/${slug}/ideas`);
    revalidatePath(`/s/${slug}/calendar`);
    return { ok: true, event: null };
  }

  if (!input.date) return { ok: false, error: "Pick a date, or mark it to be confirmed." };
  const eventDate = new Date(`${input.date}T${input.time || "00:00"}:00`);
  if (Number.isNaN(eventDate.getTime())) return { ok: false, error: "That date/time isn't valid." };
  const description = ideaEventDescription(item.body, item.timeline);

  let event: ArtistEvent;
  if (item.calendar_event_id) {
    const { data, error } = await supabase
      .from("artist_events")
      .update({
        event_date: eventDate.toISOString(),
        venue: item.title,
        description,
        image_url: item.image_url,
      })
      .eq("id", item.calendar_event_id)
      .select()
      .single();
    if (error) return { ok: false, error: error.message };
    event = data;
  } else {
    const { data, error } = await supabase
      .from("artist_events")
      .insert({
        artist_id: artistId,
        event_date: eventDate.toISOString(),
        venue: item.title,
        description,
        image_url: item.image_url,
        source: "idea",
      })
      .select()
      .single();
    if (error) return { ok: false, error: error.message };
    event = data;
    await supabase.from("board_items").update({ calendar_event_id: event.id }).eq("id", itemId);
  }

  const { error: updateError } = await supabase
    .from("board_items")
    .update({ calendar_status: "confirmed", scheduled_date: input.date, scheduled_time: input.time || null })
    .eq("id", itemId);
  if (updateError) return { ok: false, error: updateError.message };

  updateTag(artistCacheTag(slug));
  revalidatePath(`/s/${slug}/ideas`);
  revalidatePath(`/s/${slug}/calendar`);
  return { ok: true, event };
}

/** Un-schedules an idea — clears its calendar_status/scheduled fields and
 * deletes the artist_events row scheduling had created, without touching
 * the idea itself (it stays in Liked). This is the "remove" button on the
 * to-be-confirmed stack at the bottom of the Calendar tab, for when
 * "Add to calendar" gets tapped by accident. */
export async function unscheduleIdeaFromCalendar(itemId: string, slug: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createServiceRoleClient();
  const { data: item } = await supabase
    .from("board_items")
    .select("calendar_event_id")
    .eq("id", itemId)
    .maybeSingle();

  if (item?.calendar_event_id) {
    await supabase.from("artist_events").delete().eq("id", item.calendar_event_id);
  }

  const { error } = await supabase
    .from("board_items")
    .update({ calendar_status: null, scheduled_date: null, scheduled_time: null, calendar_event_id: null })
    .eq("id", itemId);
  if (error) return { ok: false, error: error.message };

  updateTag(artistCacheTag(slug));
  revalidatePath(`/s/${slug}/ideas`);
  revalidatePath(`/s/${slug}/calendar`);
  return { ok: true };
}
