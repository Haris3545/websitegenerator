"use client";

import { useRef, useState } from "react";
import {
  addDiscussionPost,
  deleteDiscussionPost,
  toggleDiscussionReaction,
  uploadDiscussionImage,
} from "@/app/s/[slug]/discussionActions";
import { GifPickerModal } from "@/components/site/GifPickerModal";
import type { DiscussionPost, DiscussionReaction } from "@/lib/database.types";
import type { GifResult } from "@/lib/giphy";

export type DiscussionPostWithReactions = DiscussionPost & { discussion_reactions: DiscussionReaction[] };

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢"];

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

/** The Dashboard's Discussion section: anyone past the artist's password
 * gate can post a question/comment, react (like/dislike + a handful of
 * quick emoji), and attach an image or a GIF. There's no real per-visitor
 * login on this site (see verifyArtistAccess) — the first time someone
 * tries to post or react, they're asked once for a display name, which is
 * then just remembered in this browser's localStorage and sent along with
 * every action from here on. */
export function DiscussionBoard({
  artistId,
  slug,
  posts,
}: {
  artistId: string;
  slug: string;
  posts: DiscussionPostWithReactions[];
}) {
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
  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const [pendingGif, setPendingGif] = useState<GifResult | null>(null);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    let imageUrl: string | null = null;
    if (pendingImage) {
      const formData = new FormData();
      formData.append("image", pendingImage.file);
      const result = await uploadDiscussionImage(slug, formData);
      if (result.ok) imageUrl = result.url;
    }
    await addDiscussionPost(artistId, name, body, imageUrl, pendingGif?.url ?? null);
    setBody("");
    setPendingImage(null);
    setPendingGif(null);
    setPosting(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
    setPendingGif(null);
    e.target.value = "";
  }

  async function handleReact(postId: string, kind: string, name: string) {
    await toggleDiscussionReaction(postId, name, kind);
  }

  async function handleDelete(postId: string) {
    await deleteDiscussionPost(postId);
  }

  return (
    <div
      className="flex flex-col gap-4 p-5"
      style={{
        backgroundColor: "rgba(0,0,0,0.4)",
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

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Attach image"
              title="Attach image"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
                <rect x="2.5" y="3.5" width="15" height="13" rx="2" stroke="currentColor" strokeWidth={1.5} />
                <circle cx="7" cy="8" r="1.4" stroke="currentColor" strokeWidth={1.4} />
                <path d="m4 14 4-4 3 3 3-4 3 4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
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

      {posts.length === 0 ? (
        <p className="py-2 text-center text-sm text-white/40">
          Nothing here yet — be the first to start the conversation.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((post) => {
            const counts = reactionCounts(post.discussion_reactions);
            const mine = (kind: string) => myName && post.discussion_reactions.some((r) => r.author_name === myName && r.kind === kind);
            return (
              <div key={post.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-sm font-medium text-white/90">{post.author_name}</span>
                    <span className="ml-2 text-xs text-white/35">{relativeTime(post.created_at)}</span>
                  </div>
                  {myName === post.author_name && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(post.id)}
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

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => withName((name) => handleReact(post.id, "like", name))}
                    className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                      mine("like") ? "border-[var(--accent)] text-[var(--accent)]" : "border-white/10 text-white/50 hover:border-white/25"
                    }`}
                  >
                    👍 {counts.like ?? 0}
                  </button>
                  <button
                    type="button"
                    onClick={() => withName((name) => handleReact(post.id, "dislike", name))}
                    className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                      mine("dislike") ? "border-[var(--accent)] text-[var(--accent)]" : "border-white/10 text-white/50 hover:border-white/25"
                    }`}
                  >
                    👎 {counts.dislike ?? 0}
                  </button>
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => withName((name) => handleReact(post.id, emoji, name))}
                      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                        mine(emoji) ? "border-[var(--accent)]" : "border-white/10 text-white/50 hover:border-white/25"
                      }`}
                    >
                      {emoji} {counts[emoji] ? counts[emoji] : ""}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
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
