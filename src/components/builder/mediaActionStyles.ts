// Shared styling for the three ways media gets into the builder — upload,
// search, paste — so the same action always looks the same wherever it
// shows up (MediaUploadField's image/video fields, YoutubeClipField's link
// entry), instead of every field inventing its own near-identical grey
// button and leaving it unclear which one does what.
export const UPLOAD_BUTTON_CLASS =
  "inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600";
export const SEARCH_BUTTON_CLASS =
  "inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50 disabled:hover:bg-violet-600";
// Specifically for "search YouTube" (as opposed to the generic web-image
// search above) — YouTube's own red, so the button itself hints at what
// it searches before you even read the label.
export const YOUTUBE_BUTTON_CLASS =
  "inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#FF0000] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#E60000] disabled:opacity-50 disabled:hover:bg-[#FF0000]";
export const PASTE_ZONE_CLASS =
  "rounded-lg border-2 border-dashed border-emerald-500/40 bg-emerald-500/[0.04] transition-colors dark:border-emerald-400/30 dark:bg-emerald-400/[0.04]";
export const PASTE_ZONE_FOCUS_CLASS =
  "border-emerald-500 bg-emerald-500/10 dark:border-emerald-400 dark:bg-emerald-400/10";
