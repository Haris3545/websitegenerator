"use client";

import { useEffect, useId, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";
import { ImageSearchModal } from "@/components/builder/ImageSearchModal";
import { YoutubeSearchModal } from "@/components/builder/YoutubeSearchModal";
import { VideoTrimTimeline } from "@/components/builder/VideoTrimTimeline";
import { importImageFromUrl, downloadYoutubeClipAction } from "@/app/builder/searchActions";
import { loadYoutubeIframeApi, parseYoutubeVideoId, type YTPlayer } from "@/lib/youtubeIframeApi";
import { YoutubeIcon } from "@/components/builder/YoutubeIcon";
import { YoutubeCaptureCard, supportsTabCapture } from "@/components/builder/YoutubeCaptureCard";
import type { ImageSearchResult } from "@/lib/googleImageSearch";
import type { YoutubeVideoSearchResult } from "@/lib/youtube";

// A clipboard paste hands over the browser's own raw bitmap rendering of
// the copied image, not the (often already-compressed JPEG) file it
// originally came from — a photo that's a few MB as a saved file can paste
// in as a 30-40MB uncompressed PNG. Compression below is exactly what's
// supposed to bring a file like that back down, so this ceiling only needs
// to guard against genuinely pathological input, not gate out the ordinary
// large-paste case compression exists to handle.
const IMAGE_MAX_MB = 60;
const IMAGE_MAX_DIMENSION = 2560; // sharp on a large TV, without shipping an oversized file
const VIDEO_MAX_MB = 100;
const MAX_CLIP_SECONDS = 10;

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

type Draft = { videoId: string; start: number; end: number };
type Panel = null | "paste-image" | "paste-youtube" | "youtube-draft";

const MENU_ITEM_CLASS =
  "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-white/80 dark:hover:bg-white/5";

/** Every way to get a background in — upload a file, search the web,
 * paste an image, search YouTube, paste a YouTube link — used to all sit
 * as separate, permanently-visible buttons/zones stacked on top of each
 * other (five entry points at once per background slot). Collapsed behind
 * a single "Add/Replace background" trigger with a dropdown instead, so
 * only whichever one method is actually in progress is on screen — picking
 * "Paste an image" or "Paste a YouTube link" reveals just that one small
 * panel in the menu's place; picking "Search YouTube" (or pasting a link)
 * leads into the same trim-then-download flow either way. */
export function BackgroundMediaField({
  label,
  slotName,
  artistSlug,
  value,
  onChange,
  artistName = "",
}: {
  label: string;
  /** Storage filename stem for this slot, e.g. "background" or
   * "gate-background" — kept distinct per slot even though both accept
   * either media kind, from any of the methods below. */
  slotName: string;
  artistSlug: string;
  value: string | null;
  onChange: (url: string | null) => void;
  /** Pre-fills the image/YouTube search modals' query boxes so the artist's
   * name is already sitting there — still just a starting point, not an
   * auto-search, so it still costs a deliberate Enter/click either way. */
  artistName?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteFocused, setPasteFocused] = useState(false);
  const [imageSearching, setImageSearching] = useState(false);
  const [youtubeSearching, setYoutubeSearching] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  // Cancelling the trim draft used to clear `draft`/`panel` synchronously —
  // a substantial block (video preview + timeline + buttons) vanishing in
  // one frame, snapping the page straight back up to the collapsed "Add
  // background" button wherever that happened to land on screen. Collapsing
  // it first (same grid-rows technique the dropdown menu below uses) and
  // only clearing draft/panel once that finishes reads as an intentional
  // close instead of a jump cut.
  const [draftClosing, setDraftClosing] = useState(false);

  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const previewPollRef = useRef<number | null>(null);
  const playbackSyncPollRef = useRef<number | null>(null);
  const lastPolledTimeRef = useRef(0);
  const lastSeekAtRef = useRef(0);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  // Mounts the trim-preview YouTube player whenever a draft is active — see
  // YoutubeClipField's original version of this same effect for the full
  // reasoning on imperative mounting and the scrub-sync poll.
  useEffect(() => {
    if (!draft) return;
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    const mountEl = document.createElement("div");
    mountEl.className = "h-full w-full";
    container.appendChild(mountEl);

    loadYoutubeIframeApi().then((YT) => {
      if (cancelled) return;
      playerRef.current = new YT.Player(mountEl, {
        videoId: draft.videoId,
        playerVars: { modestbranding: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: (e) => {
            setDuration(e.target.getDuration());
            lastPolledTimeRef.current = e.target.getCurrentTime();
            playbackSyncPollRef.current = window.setInterval(() => {
              const player = playerRef.current;
              if (!player) return;
              const now = player.getCurrentTime();
              const delta = now - lastPolledTimeRef.current;
              lastPolledTimeRef.current = now;
              if (performance.now() - lastSeekAtRef.current < 500) return;
              if (Math.abs(delta) > 1.2) setDraftWindowStart(now);
            }, 250);
          },
        },
      });
    });
    return () => {
      cancelled = true;
      if (previewPollRef.current) window.clearInterval(previewPollRef.current);
      if (playbackSyncPollRef.current) window.clearInterval(playbackSyncPollRef.current);
      playerRef.current?.destroy();
      playerRef.current = null;
      container.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only (re)mount the player when the draft's video itself changes
  }, [draft?.videoId]);

  function closeMenuAnd(next: Panel) {
    setMenuOpen(false);
    setPanel(next);
  }

  function backToMenu() {
    setPanel(null);
    setUrlInput("");
    setUrlError(null);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          void handleFile(file);
        }
        return;
      }
    }
  }

  async function handleFile(file: File) {
    setError(null);
    const isVideo = file.type.startsWith("video/");

    if (isVideo && file.size > VIDEO_MAX_MB * 1024 * 1024) {
      setError(`Video must be under ${VIDEO_MAX_MB}MB.`);
      return;
    }
    if (!isVideo && file.size > IMAGE_MAX_MB * 1024 * 1024) {
      setError(`Image must be under ${IMAGE_MAX_MB}MB before compression.`);
      return;
    }

    setUploading(true);
    try {
      let uploadFile: File = file;
      if (!isVideo) {
        uploadFile = await imageCompression(file, {
          maxWidthOrHeight: IMAGE_MAX_DIMENSION,
          maxSizeMB: 2,
          useWebWorker: true,
          fileType: file.type === "image/png" ? "image/png" : "image/webp",
        });
      }

      const supabase = createClient();
      const ext = uploadFile.name.split(".").pop() || (isVideo ? "mp4" : "webp");
      const path = `${artistSlug}/${slotName}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("artist-media")
        .upload(path, uploadFile, { upsert: true, contentType: uploadFile.type, cacheControl: "0" });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("artist-media").getPublicUrl(path);
      onChange(`${data.publicUrl}?t=${Date.now()}`);
      setPanel(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // Returns whether the pick actually worked — ImageSearchModal keeps
  // itself open and drops the thumbnail from its grid on a false, instead
  // of this closing the modal up front and surfacing a dead-link error
  // someone has to notice and dismiss before trying another result.
  async function handleImagePicked(result: ImageSearchResult): Promise<boolean> {
    setError(null);
    const uploadResult = await importImageFromUrl(result.original, artistSlug, slotName);
    if (uploadResult.ok) {
      onChange(uploadResult.data);
      setImageSearching(false);
      return true;
    }
    return false;
  }

  function beginUrlOrSearchDraft(id: string) {
    setUrlError(null);
    setUrlInput("");
    setDuration(null);
    setDownloadError(null);
    setDraft({ videoId: id, start: 0, end: MAX_CLIP_SECONDS });
    setPanel("youtube-draft");
  }

  function beginUrlSubmit() {
    const id = parseYoutubeVideoId(urlInput);
    if (!id) {
      setUrlError("That doesn't look like a YouTube link.");
      return;
    }
    beginUrlOrSearchDraft(id);
  }

  function handleVideoPicked(result: YoutubeVideoSearchResult) {
    setYoutubeSearching(false);
    beginUrlOrSearchDraft(result.videoId);
  }

  function cancelDraft() {
    setDraftClosing(true);
    setDownloadError(null);
    // Matches the 200ms grid-rows transition below plus a little slack for
    // the browser to actually paint the collapse before the DOM disappears.
    window.setTimeout(() => {
      setDraft(null);
      setPanel(null);
      setDraftClosing(false);
      fieldRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 220);
  }

  async function confirmDraft() {
    if (!draft) return;
    setDownloadError(null);
    // Server-side extraction is reliably blocked as bot traffic by
    // YouTube's own IP-reputation checks, so wherever the browser can
    // support it (Chromium's Region Capture API), the clip is instead
    // recorded live in this browser — a real human, on a real residential
    // IP, sharing the tab back to itself. The old server download only
    // remains as a fallback for browsers that can't do that.
    if (supportsTabCapture()) {
      setCapturing(true);
      return;
    }
    setDownloading(true);
    const result = await downloadYoutubeClipAction(draft.videoId, draft.start, draft.end, artistSlug, slotName);
    setDownloading(false);
    if (result.ok) {
      onChange(result.data);
      setDraft(null);
      setPanel(null);
    } else {
      setDownloadError(result.error);
    }
  }

  async function handleCaptureDone(blob: Blob) {
    setCapturing(false);
    setDownloading(true);
    setDownloadError(null);
    try {
      const supabase = createClient();
      const path = `${artistSlug}/${slotName}.webm`;
      const { error: uploadError } = await supabase.storage
        .from("artist-media")
        .upload(path, blob, { upsert: true, contentType: "video/webm", cacheControl: "0" });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("artist-media").getPublicUrl(path);
      onChange(`${data.publicUrl}?t=${Date.now()}`);
      setDraft(null);
      setPanel(null);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setDownloading(false);
    }
  }

  function handleCaptureCancel(message?: string) {
    setCapturing(false);
    if (message) setDownloadError(message);
  }

  const SEEK_THROTTLE_MS = 90;
  function seekPreview(t: number) {
    const player = playerRef.current;
    if (!player) return;
    const now = performance.now();
    if (now - lastSeekAtRef.current < SEEK_THROTTLE_MS) return;
    lastSeekAtRef.current = now;
    player.seekTo(t, true);
  }

  function setDraftStart(next: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const clampedStart = Math.max(0, next);
      const minEnd = clampedStart + 1;
      const maxEnd = clampedStart + MAX_CLIP_SECONDS;
      const clampedEnd = Math.min(Math.max(prev.end, minEnd), maxEnd, duration ?? maxEnd);
      seekPreview(clampedStart);
      return { ...prev, start: clampedStart, end: Math.max(clampedEnd, minEnd) };
    });
  }

  function setDraftEnd(next: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const clampedEnd = Math.min(next, duration ?? next);
      const clampedStart = Math.max(0, Math.max(prev.start, clampedEnd - MAX_CLIP_SECONDS));
      seekPreview(clampedEnd);
      return { ...prev, start: clampedStart, end: clampedEnd };
    });
  }

  function setDraftWindowStart(newStart: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const span = prev.end - prev.start;
      seekPreview(newStart);
      return { ...prev, start: newStart, end: newStart + span };
    });
  }

  function applyCurrentTimeAs(which: "start" | "end") {
    const t = playerRef.current?.getCurrentTime();
    if (t === undefined) return;
    if (which === "start") setDraftStart(t);
    else setDraftEnd(t);
  }

  function previewClip() {
    const player = playerRef.current;
    if (!player || !draft) return;
    player.seekTo(draft.start, true);
    player.playVideo();
    if (previewPollRef.current) window.clearInterval(previewPollRef.current);
    previewPollRef.current = window.setInterval(() => {
      if (draft && player.getCurrentTime() >= draft.end) {
        player.pauseVideo();
        if (previewPollRef.current) window.clearInterval(previewPollRef.current);
      }
    }, 200);
  }

  return (
    <div ref={fieldRef} className="flex flex-col gap-2 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-white/50">
        {label}
      </span>

      {value &&
        (isVideoUrl(value) ? (
          <video
            src={value}
            className="h-32 w-full rounded-lg border border-neutral-200 object-cover dark:border-white/10 lg:h-44 2xl:h-56"
            muted
            loop
            autoPlay
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            className="h-32 w-full rounded-lg border border-neutral-200 object-cover dark:border-white/10 lg:h-44 2xl:h-56"
          />
        ))}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*,video/*"
        disabled={uploading}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {panel === "youtube-draft" && draft ? (
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${
            draftClosing ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
          }`}
        >
          <div className="overflow-hidden">
            <div
              className={`flex flex-col gap-3 rounded-lg border border-neutral-200 p-3 transition-opacity duration-150 dark:border-white/10 ${
                draftClosing ? "opacity-0" : "opacity-100"
              }`}
            >
              <div ref={containerRef} className="aspect-video w-full overflow-hidden rounded-lg bg-black" />

              <VideoTrimTimeline
                duration={Math.max(duration ?? MAX_CLIP_SECONDS * 10, 1)}
                start={draft.start}
                end={draft.end}
                maxClipSeconds={MAX_CLIP_SECONDS}
                onStartChange={setDraftStart}
                onEndChange={setDraftEnd}
                onWindowShift={setDraftWindowStart}
              />

              <div className="flex items-center justify-between gap-2 text-xs text-neutral-600 dark:text-white/60">
                <span>
                  {formatSeconds(draft.start)} – {formatSeconds(draft.end)}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={downloading}
                    onClick={() => applyCurrentTimeAs("start")}
                    className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-[11px] font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/5"
                  >
                    Set start to current
                  </button>
                  <button
                    type="button"
                    disabled={downloading}
                    onClick={() => applyCurrentTimeAs("end")}
                    className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-[11px] font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/5"
                  >
                    Set end to current
                  </button>
                </div>
              </div>

              <p className="text-xs text-neutral-400 dark:text-white/40">
                Clip length: {(draft.end - draft.start).toFixed(1)}s (max {MAX_CLIP_SECONDS}s). Confirming
                captures exactly this window into a real file — nothing&apos;s uploaded until it finishes.
              </p>

              {downloadError && <p className="text-xs text-red-600 dark:text-red-400">{downloadError}</p>}

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={downloading || capturing}
                  onClick={previewClip}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/5"
                >
                  Preview clip
                </button>
                <button
                  type="button"
                  disabled={downloading || capturing}
                  onClick={cancelDraft}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 disabled:opacity-50 dark:text-white/50 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={downloading || capturing}
                  onClick={() => void confirmDraft()}
                  className="rounded-lg bg-builder-accent px-3 py-1.5 text-xs font-semibold text-black transition-transform [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {downloading ? "Uploading…" : capturing ? "Recording…" : "Confirm clip"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : panel === "paste-image" ? (
        <div className="flex flex-col gap-2">
          <div
            tabIndex={0}
            role="button"
            autoFocus
            onPaste={handlePaste}
            onFocus={() => setPasteFocused(true)}
            onBlur={() => setPasteFocused(false)}
            className={`flex items-center gap-2 rounded-lg border-2 border-dashed border-emerald-500/40 bg-emerald-500/[0.04] px-3 py-2.5 focus:outline-none dark:border-emerald-400/30 dark:bg-emerald-400/[0.04] ${
              pasteFocused ? "border-emerald-500 bg-emerald-500/10 dark:border-emerald-400 dark:bg-emerald-400/10" : ""
            }`}
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden>
              <rect x="5.5" y="3.5" width="9" height="13" rx="1.5" stroke="currentColor" strokeWidth={1.6} />
              <path d="M8 3.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v.5" stroke="currentColor" strokeWidth={1.6} />
              <path d="M8 10h4M8 12.5h4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
            </svg>
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              {uploading ? "Uploading…" : "Click here, then paste an image (Ctrl/⌘+V)"}
            </span>
          </div>
          <button
            type="button"
            onClick={backToMenu}
            className="self-start text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:text-white/40 dark:hover:text-white/80"
          >
            ← Back
          </button>
        </div>
      ) : panel === "paste-youtube" ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 rounded-lg border-2 border-dashed border-emerald-500/40 bg-emerald-500/[0.04] p-2 dark:border-emerald-400/30 dark:bg-emerald-400/[0.04]">
            <input
              autoFocus
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                setUrlError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  beginUrlSubmit();
                }
              }}
              placeholder="Paste a YouTube link"
              className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm placeholder-neutral-400 focus:border-emerald-500 focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder-white/30"
            />
            <button
              type="button"
              onClick={beginUrlSubmit}
              disabled={!urlInput.trim()}
              className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              Use link
            </button>
          </div>
          {urlError && <p className="text-red-600 dark:text-red-400">{urlError}</p>}
          <button
            type="button"
            onClick={backToMenu}
            className="self-start text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:text-white/40 dark:hover:text-white/80"
          >
            ← Back
          </button>
        </div>
      ) : (
        <div ref={menuRef} className="relative">
          <button
            type="button"
            disabled={uploading}
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-left text-sm font-medium text-neutral-700 transition-shadow duration-150 focus:border-builder-accent focus:shadow-[0_0_0_3px_rgba(255,201,49,0.2)] focus:outline-none disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80"
          >
            {uploading ? "Uploading…" : value ? "Replace background" : "Add background"}
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-200 dark:text-white/40 ${
                menuOpen ? "rotate-180" : ""
              }`}
              aria-hidden
            >
              <path d="m5.5 7.5 4.5 5 4.5-5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Always mounted so the unfurl can animate closed too, and a
              grid-rows (not absolute-overlay) animation so it pushes
              whatever's below down rather than covering it — the same fix
              FontPicker's dropdown needed for the same reason. */}
          <div
            className={`grid w-full max-w-xs transition-[grid-template-rows] duration-200 ease-out ${
              menuOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="overflow-hidden">
              <div
                className={`mt-2 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg transition-opacity duration-150 dark:border-white/10 dark:bg-neutral-900 ${
                  menuOpen ? "opacity-100 delay-75" : "opacity-0"
                }`}
              >
                <button type="button" onClick={() => { setMenuOpen(false); inputRef.current?.click(); }} className={MENU_ITEM_CLASS}>
                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden>
                    <path d="M10 12.5V3.5M10 3.5 6 7.5M10 3.5l4 4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 13v1.5A1.5 1.5 0 0 0 5.5 16h9a1.5 1.5 0 0 0 1.5-1.5V13" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Upload a file
                </button>
                <button type="button" onClick={() => { setMenuOpen(false); setImageSearching(true); }} className={MENU_ITEM_CLASS}>
                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden>
                    <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth={1.6} />
                    <path d="m16 16-3.4-3.4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
                  </svg>
                  Search the web for an image
                </button>
                <button type="button" onClick={() => closeMenuAnd("paste-image")} className={MENU_ITEM_CLASS}>
                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden>
                    <rect x="5.5" y="3.5" width="9" height="13" rx="1.5" stroke="currentColor" strokeWidth={1.6} />
                    <path d="M8 3.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v.5" stroke="currentColor" strokeWidth={1.6} />
                    <path d="M8 10h4M8 12.5h4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
                  </svg>
                  Paste an image
                </button>
                <button type="button" onClick={() => { setMenuOpen(false); setYoutubeSearching(true); }} className={MENU_ITEM_CLASS}>
                  <YoutubeIcon className="h-4 w-4 shrink-0" />
                  Search YouTube for a clip
                </button>
                <button type="button" onClick={() => closeMenuAnd("paste-youtube")} className={MENU_ITEM_CLASS}>
                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden>
                    <path d="M8 12a3 3 0 0 0 3 3l2-2a3 3 0 0 0-4.2-4.2" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
                    <path d="M12 8a3 3 0 0 0-3-3l-2 2a3 3 0 0 0 4.2 4.2" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
                  </svg>
                  Paste a YouTube link
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
      {panel === null && (
        <p className="text-xs text-neutral-400 dark:text-white/40">
          Accepts an image or a video, from a file, the web, or a trimmed YouTube clip. Images are
          auto-compressed to fit {IMAGE_MAX_DIMENSION}px / ~2MB; uploaded videos are capped at{" "}
          {VIDEO_MAX_MB}MB.
        </p>
      )}
      {imageSearching && (
        <ImageSearchModal
          onSelect={handleImagePicked}
          onClose={() => setImageSearching(false)}
          initialQuery={artistName}
        />
      )}
      {youtubeSearching && (
        <YoutubeSearchModal
          onSelect={handleVideoPicked}
          onClose={() => setYoutubeSearching(false)}
          initialQuery={artistName}
        />
      )}
      {capturing && draft && (
        <YoutubeCaptureCard
          videoId={draft.videoId}
          start={draft.start}
          end={draft.end}
          onDone={(blob) => void handleCaptureDone(blob)}
          onCancel={handleCaptureCancel}
        />
      )}
    </div>
  );
}
