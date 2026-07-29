// Shared styling for the one remaining standalone media-action button in
// the builder (the "Search YouTube" channel-search button in ArtistForm's
// initial-setup section — unrelated to background images/video, which now
// go through BackgroundMediaField's own single consolidated menu instead
// of a row of separate buttons like this one used to be part of).
// YouTube's own red, so the button itself hints at what it searches before
// you even read the label.
export const YOUTUBE_BUTTON_CLASS =
  "inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#FF0000] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#E60000] disabled:opacity-50 disabled:hover:bg-[#FF0000]";
