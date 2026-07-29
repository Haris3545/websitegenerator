/** YouTube's own play-button mark, redrawn as a plain SVG (no external
 * asset/font dependency) — used on every "search YouTube" button so it
 * reads as YouTube-specific at a glance. Colours are hardcoded (red body,
 * white triangle — YouTube's actual brand mark) rather than currentColor,
 * since this sits on menu items whose text colour flips between light/dark
 * mode — inheriting that would make the body itself flip too, when it's
 * meant to read the same regardless of surrounding theme. */
export function YoutubeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.7 31.7 0 0 0 0 12a31.7 31.7 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.7 31.7 0 0 0 24 12a31.7 31.7 0 0 0-.5-5.8Z"
        fill="#FF0000"
      />
      <path d="M9.6 15.6 15.8 12 9.6 8.4v7.2Z" fill="#ffffff" />
    </svg>
  );
}
