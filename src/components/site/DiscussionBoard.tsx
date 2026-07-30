"use client";

import { useRef, useState } from "react";
import {
  addDiscussionPost,
  deleteDiscussionPost,
  importDiscussionImageFromUrl,
  toggleDiscussionReaction,
  uploadDiscussionImage,
} from "@/app/s/[slug]/discussionActions";
import { GifPickerModal } from "@/components/site/GifPickerModal";
import { ImageSearchModal } from "@/components/builder/ImageSearchModal";
import { PoofEffectProvider, useTriggerPoof } from "@/hooks/usePoofEffect";
import type { DiscussionPost, DiscussionReaction } from "@/lib/database.types";
import type { GifResult } from "@/lib/giphy";
import type { ImageSearchResult } from "@/lib/googleImageSearch";

export type DiscussionPostWithReactions = DiscussionPost & { discussion_reactions: DiscussionReaction[] };

// The fixed quick-react row — always shown in this order regardless of
// counts, so reacting doesn't require hunting for where a reaction landed.
// Any other emoji picked from the "+" picker below still shows up as its
// own pill once it's been used, it's just not part of this guaranteed set.
const FIXED_REACTIONS = ["👍", "👎", "❤️", "😂", "😮", "😢"];

// A broad-but-not-exhaustive curated set for the "+" picker — not a full
// Unicode CLDR emoji dataset (that'd need a real dependency), just enough
// common ground to react with almost anything without leaving the fixed
// row's six behind.
const EXTRA_EMOJIS = [
  "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "🙂", "😉", "😊",
  "🥰", "😍", "😘", "😜", "🤪", "🤔", "🤨", "😐", "🙄", "😏",
  "😴", "🤤", "😷", "🤒", "🥵", "🥶", "🤯", "🥳", "😎", "🤓",
  "🧐", "😕", "🙁", "😤", "😠", "😡", "🤬", "😱", "😨", "😰",
  "😥", "😓", "🤗", "🤭", "🫡", "🤫", "🤥", "🙌", "👏", "🙏",
  "💪", "🔥", "✨", "💯", "🎉", "🎊", "👀", "💀", "🤡", "👻",
  "💩", "🚀", "⭐", "💔", "💕", "💖", "👌", "✌️", "🤞", "🤙",
  "👊", "✊", "🫶", "🥲", "😬", "🫠",
];

function displayNameKey(artistId: string) {
  return `discussion-name:${artistId}`;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function reactionCounts(reactions: DiscussionReaction[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of reactions) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  return counts;
}

// Fixed reactions always show first (even at 0), then any other emoji kind
// that's actually been used on this post, so a "+"-picked reaction is never
// hidden once someone's reacted with it.
function visibleReactionKinds(post: DiscussionPostWithReactions): string[] {
  const extra = [...new Set(post.discussion_reactions.map((r) => r.kind))].filter(
    (k) => !FIXED_REACTIONS.includes(k)
  );
  return [...FIXED_REACTIONS, ...extra];
}

type PendingImage = { previewUrl: string; file: File | null; uploadedUrl: string | null };

const UNDO_WINDOW_MS = 4000;

type PendingDelete = {
  id: string;
  post: DiscussionPostWithReactions;
  replies: DiscussionPostWithReactions[];
  timer: number;
};

/** The Dashboard's Discussion section: anyone past the artist's password
 * gate can post a question/comment, reply to it, react with a fixed quick
 * row (thumbs up/down, heart, laugh, wow, cry) or any emoji via the "+"
 * picker, and attach an image (upload or Google Images search) or a GIF.
 * There's no real per-visitor login on this site (see verifyArtistAccess)
 * — the first time someone tries to post or react, they're asked once for
 * a display name, remembered in this browser's localStorage from then on.
 *
 * Holds its own optimistic copy of `posts` (mirrored from the prop, then
 * mutated directly on every action) rather than reading the prop straight
 * through — without it, a reaction/post/delete only appeared to work once
 * the next full page load happened to re-fetch, since revalidatePath alone
 * doesn't push new data into an already-mounted client tree. */
export function DiscussionBoard(props: {
  artistId: string;
  slug: string;
  posts: DiscussionPostWithReactions[];
}) {
  return (
    <PoofEffectProvider>
      <DiscussionBoardInner {...props} />
    </PoofEffectProvider>
  );
}

function DiscussionBoardInner({
  artistId,
  slug,
  posts,
}: {
  artistId: string;
  slug: string;
  posts: DiscussionPostWithReactions[];
}) {
  const [items, setItems] = useState(posts);
  const triggerPoof = useTriggerPoof();

  // A lazy initializer (not an effect) reads localStorage once up front —
  // this only ever drives event-handler behavior (whether posting/reacting
  // needs the name prompt first) and the "Delete" button's visibility,
  // never anything that would show a text mismatch between server and
  // client renders, so there's no hydration concern in reading it this way.
  const [myName, setMyName] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(displayNameKey(artistId))
  );
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const pendingActionRef = useRef<((name: string) => void) | null>(null);

  const [body, setBody] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [pendingGif, setPendingGif] = useState<GifResult | null>(null);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [imageSearchOpen, setImageSearchOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const [emojiPickerPostId, setEmojiPickerPostId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [justAddedIds, setJustAddedIds] = useState<Set<string>>(new Set());
  const [pendingDeletes, setPendingDeletes] = useState<PendingDelete[]>([]);

  function withName(action: (name: string) => void) {
    if (myName) {
      action(myName);
      return;
    }
    pendingActionRef.current = action;
    setNameDraft("");
    setNamePromptOpen(true);
  }

  function confirmName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    window.localStorage.setItem(displayNameKey(artistId), trimmed);
    setMyName(trimmed);
    setNamePromptOpen(false);
    pendingActionRef.current?.(trimmed);
    pendingActionRef.current = null;
  }

  async function handlePost(name: string) {
    if (!body.trim() && !pendingImage && !pendingGif) return;
    setPosting(true);
    setPostError(null);
    try {
      let imageUrl: string | null = pendingImage?.uploadedUrl ?? null;
      if (pendingImage && !imageUrl && pendingImage.file) {
        const formData = new FormData();
        formData.append("image", pendingImage.file);
        const uploadResult = await uploadDiscussionImage(slug, formData);
        if (!uploadResult.ok) {
          setPostError(uploadResult.error);
          return;
        }
        imageUrl = uploadResult.url;
      }
      const result = await addDiscussionPost(artistId, name, body, imageUrl, pendingGif?.url ?? null);
      if (!result.ok) {
        setPostError(result.error);
        return;
      }
      setItems((prev) => [{ ...result.post, discussion_reactions: [] }, ...prev]);
      setJustAddedIds((prev) => new Set(prev).add(result.post.id));
      setBody("");
      setPendingImage(null);
      setPendingGif(null);
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Couldn't post — try again.");
    } finally {
      setPosting(false);
    }
  }

  async function handleReply(parentId: string, name: string) {
    if (!replyBody.trim() || replying) return;
    setReplying(true);
    setReplyError(null);
    try {
      const result = await addDiscussionPost(artistId, name, replyBody, null, null, parentId);
      if (!result.ok) {
        setReplyError(result.error);
        return;
      }
      setItems((prev) => [...prev, { ...result.post, discussion_reactions: [] }]);
      setJustAddedIds((prev) => new Set(prev).add(result.post.id));
      setReplyBody("");
      setReplyingToId(null);
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "Couldn't reply — try again.");
    } finally {
      setReplying(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingImage({ previewUrl: URL.createObjectURL(file), file, uploadedUrl: null });
    setPendingGif(null);
    e.target.value = "";
  }

  async function handleImagePicked(result: ImageSearchResult): Promise<boolean> {
    const uploadResult = await importDiscussionImageFromUrl(result.original, slug);
    if (!uploadResult.ok) return false;
    setPendingImage({ previewUrl: result.thumbnail, file: null, uploadedUrl: uploadResult.url });
    setPendingGif(null);
    setImageSearchOpen(false);
    return true;
  }

  // Optimistic: the toggled reaction shows up (or disappears) immediately,
  // the server call just confirms it in the background — a reaction that
  // waited on a full round trip before showing anything read as broken/slow.
  function handleReact(postId: string, kind: string, name: string) {
    setEmojiPickerPostId(null);
    setItems((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const idx = p.discussion_reactions.findIndex((r) => r.author_name === name && r.kind === kind);
        if (idx >= 0) {
          return { ...p, discussion_reactions: p.discussion_reactions.filter((_, i) => i !== idx) };
        }
        // A deterministic placeholder id/timestamp — neither is ever shown
        // for a reaction, so there's nothing lost by not using
        // Math.random()/Date.now() here (those also aren't safe to call
        // from a plain function body under the React Compiler's purity
        // rule), and the real row (with its real id) replaces this the
        // moment the server confirms it via handleSaved-style reconciling
        // isn't even needed since nothing here reads the id back out.
        const optimistic: DiscussionReaction = {
          id: `optimistic-${postId}-${name}-${kind}`,
          post_id: postId,
          author_name: name,
          kind,
          created_at: p.created_at,
        };
        return { ...p, discussion_reactions: [...p.discussion_reactions, optimistic] };
      })
    );
    void toggleDiscussionReaction(postId, name, kind);
  }

  // Deleting doesn't hit the server right away — after the poof animation
  // clears the post from view, it sits in pendingDeletes for 4s with an
  // Undo toast instead, and only actually calls deleteDiscussionPost once
  // that window closes without an undo.
  function handleDelete(id: string, e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    triggerPoof(rect.left + rect.width / 2, rect.top + rect.height / 2);
    setDeletingIds((prev) => new Set(prev).add(id));
    const post = items.find((p) => p.id === id);
    const replies = items.filter((p) => p.parent_id === id);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((p) => p.id !== id && p.parent_id !== id));
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (post) {
        const timer = window.setTimeout(() => {
          void deleteDiscussionPost(id);
          setPendingDeletes((pd) => pd.filter((d) => d.id !== id));
        }, UNDO_WINDOW_MS);
        setPendingDeletes((pd) => [...pd, { id, post, replies, timer }]);
      }
    }, 220);
  }

  function handleUndoDelete(id: string) {
    const entry = pendingDeletes.find((d) => d.id === id);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    setPendingDeletes((pd) => pd.filter((d) => d.id !== id));
    setItems((prev) => [entry.post, ...entry.replies, ...prev]);
  }

  const topLevel = items.filter((p) => !p.parent_id);
  const repliesFor = (id: string) => items.filter((p) => p.parent_id === id);

  function ReactionRow({ post }: { post: DiscussionPostWithReactions }) {
    const counts = reactionCounts(post.discussion_reactions);
    const mine = (kind: string) => (myName ? post.discussion_reactions.some((r) => r.author_name === myName && r.kind === kind) : false);
    return (
      <div className="relative mt-2.5 flex flex-wrap items-center gap-1.5">
        {visibleReactionKinds(post).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => withName((name) => handleReact(post.id, kind, name))}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors active:scale-90 ${
              mine(kind) ? "border-[var(--accent)] text-[var(--accent)]" : "border-white/10 text-white/50 hover:border-white/25"
            }`}
          >
            {kind} {counts[kind] ? counts[kind] : ""}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setEmojiPickerPostId((id) => (id === post.id ? null : post.id))}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-xs text-white/40 transition-colors hover:border-white/25 hover:text-white/70"
          aria-label="Add reaction"
        >
          +
        </button>
        {emojiPickerPostId === post.id && (
          <div className="absolute left-0 top-full z-[60] mt-1 grid w-56 grid-cols-8 gap-1 rounded-xl border border-white/10 bg-neutral-950 p-2.5 shadow-2xl">
            {EXTRA_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => withName((name) => handleReact(post.id, emoji, name))}
                className="flex h-6 w-6 items-center justify-center rounded text-sm hover:bg-white/10"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-4 p-5"
      style={{
        backgroundColor: "rgba(0,0,0,var(--card-bg-opacity, 0.4))",
        border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
        borderRadius: "var(--card-radius, 12px)",
      }}
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/70">
        <span className="h-3 w-1 bg-[var(--accent)]" />
        Discussion
      </h3>

      <div className="flex flex-col gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Ask a question or leave a comment…"
          rows={2}
          className="w-full resize-none rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white placeholder-white/30 focus:border-[var(--accent)] focus:outline-none"
        />

        {pendingImage && (
          <div className="relative w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pendingImage.previewUrl} alt="" className="h-20 w-20 rounded-lg object-cover" />
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-black/80 text-xs text-white/70 hover:text-white"
            >
              ×
            </button>
          </div>
        )}
        {pendingGif && (
          <div className="relative w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pendingGif.previewUrl} alt="" className="h-20 w-20 rounded-lg object-cover" />
            <button
              type="button"
              onClick={() => setPendingGif(null)}
              className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-black/80 text-xs text-white/70 hover:text-white"
            >
              ×
            </button>
          </div>
        )}

        {postError && <p className="text-xs text-red-400">{postError}</p>}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Upload image"
              title="Upload image"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
                <rect x="2.5" y="3.5" width="15" height="13" rx="2" stroke="currentColor" strokeWidth={1.5} />
                <circle cx="7" cy="8" r="1.4" stroke="currentColor" strokeWidth={1.4} />
                <path d="m4 14 4-4 3 3 3-4 3 4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setImageSearchOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Search images"
              title="Search images"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
                <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth={1.5} />
                <path d="m16 16-3.2-3.2" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setGifPickerOpen(true)}
              className="rounded-md px-2 py-1 text-[11px] font-bold tracking-wide text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Attach GIF"
              title="Attach GIF"
            >
              GIF
            </button>
          </div>
          <button
            type="button"
            disabled={posting || (!body.trim() && !pendingImage && !pendingGif)}
            onClick={() => withName(handlePost)}
            className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-40"
          >
            {posting ? "Posting…" : "Post"}
          </button>
        </div>
      </div>

      {topLevel.length === 0 ? (
        <p className="py-2 text-center text-sm text-white/40">
          Nothing here yet — be the first to start the conversation.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {topLevel.map((post) => (
            <div
              key={post.id}
              className={`rounded-xl border border-white/10 bg-white/[0.02] p-3.5 transition-all duration-200 ${
                deletingIds.has(post.id) ? "scale-95 opacity-0" : "scale-100 opacity-100"
              } ${justAddedIds.has(post.id) ? "animate-poof-in" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-sm font-medium text-white/90">{post.author_name}</span>
                  <span className="ml-2 text-xs text-white/35">{relativeTime(post.created_at)}</span>
                </div>
                {myName === post.author_name && (
                  <button
                    type="button"
                    onClick={(e) => handleDelete(post.id, e)}
                    className="shrink-0 text-xs text-white/30 transition-colors hover:text-red-300"
                  >
                    Delete
                  </button>
                )}
              </div>
              {post.body && <p className="mt-1.5 whitespace-pre-wrap text-sm text-white/80">{post.body}</p>}
              {(post.image_url || post.gif_url) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.image_url ?? post.gif_url ?? undefined}
                  alt=""
                  className="mt-2 max-h-56 rounded-lg object-cover"
                />
              )}

              <ReactionRow post={post} />

              <button
                type="button"
                onClick={() => {
                  setReplyingToId((id) => (id === post.id ? null : post.id));
                  setReplyBody("");
                }}
                className="mt-2 text-xs text-white/40 transition-colors hover:text-white/70"
              >
                Reply
              </button>

              {repliesFor(post.id).length > 0 && (
                <div className="mt-3 flex flex-col gap-2.5 border-l border-white/10 pl-3.5">
                  {repliesFor(post.id).map((reply) => (
                    <div
                      key={reply.id}
                      className={`transition-all duration-200 ${
                        deletingIds.has(reply.id) ? "scale-95 opacity-0" : "scale-100 opacity-100"
                      } ${justAddedIds.has(reply.id) ? "animate-poof-in" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="text-xs font-medium text-white/80">{reply.author_name}</span>
                          <span className="ml-2 text-[11px] text-white/35">{relativeTime(reply.created_at)}</span>
                        </div>
                        {myName === reply.author_name && (
                          <button
                            type="button"
                            onClick={(e) => handleDelete(reply.id, e)}
                            className="shrink-0 text-[11px] text-white/30 transition-colors hover:text-red-300"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                      {reply.body && <p className="mt-1 whitespace-pre-wrap text-xs text-white/75">{reply.body}</p>}
                      <ReactionRow post={reply} />
                    </div>
                  ))}
                </div>
              )}

              {replyingToId === post.id && (
                <div className="mt-3 flex flex-col gap-1.5 border-l border-white/10 pl-3.5">
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") withName((name) => void handleReply(post.id, name));
                      }}
                      placeholder="Write a reply…"
                      className="flex-1 rounded-lg border border-white/10 bg-transparent px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:border-[var(--accent)] focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={!replyBody.trim() || replying}
                      onClick={() => withName((name) => void handleReply(post.id, name))}
                      className="shrink-0 rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-40"
                    >
                      {replying ? "…" : "Send"}
                    </button>
                  </div>
                  {replyError && <p className="text-[11px] text-red-400">{replyError}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {pendingDeletes.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[95] flex flex-col items-center gap-2">
          {pendingDeletes.map((d) => (
            <div
              key={d.id}
              className="animate-poof-in pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-neutral-950/80 px-4 py-2 text-sm text-white/80 shadow-2xl backdrop-blur-md"
            >
              <span>Post deleted</span>
              <button
                type="button"
                onClick={() => handleUndoDelete(d.id)}
                className="font-semibold text-[var(--accent)] transition-colors hover:brightness-125"
              >
                Undo
              </button>
            </div>
          ))}
        </div>
      )}

      {gifPickerOpen && (
        <GifPickerModal
          onSelect={(gif) => {
            setPendingGif(gif);
            setPendingImage(null);
          }}
          onClose={() => setGifPickerOpen(false)}
        />
      )}

      {imageSearchOpen && (
        <ImageSearchModal
          dark
          helperText="Search for an image to attach to the post."
          onSelect={handleImagePicked}
          onClose={() => setImageSearchOpen(false)}
        />
      )}

      {namePromptOpen && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNamePromptOpen(false)}
        >
          <div
            className="animate-modal-in w-full max-w-xs rounded-xl border border-white/10 bg-neutral-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-white">What should we call you?</p>
            <p className="mt-1 text-xs text-white/40">
              Shown next to your posts and reactions on this page — remembered on this device only.
            </p>
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmName();
              }}
              placeholder="Your name"
              className="mt-3 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-[var(--accent)] focus:outline-none"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNamePromptOpen(false)}
                className="rounded-full px-3 py-1.5 text-xs text-white/50 hover:text-white/80"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!nameDraft.trim()}
                onClick={confirmName}
                className="rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-xs font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
