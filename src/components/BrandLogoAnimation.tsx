"use client";

/** The VCCP Media bear-mark animation, reused everywhere a small branded
 * flourish is wanted (login transition, empty states, an in-flight
 * refresh, a publish success moment) instead of a generic spinner/plain
 * text. Plays once and holds its final frame by default — pass loop for
 * an in-flight indicator, where holding a mid-animation frame would read
 * as broken rather than finished. Colour (inverted or not) is left to the
 * caller via className, since it depends on the surrounding
 * background — always-dark artist sites vs. the builder's own light/dark
 * toggle need different rules. */
export function BrandLogoAnimation({
  className = "h-16 w-16",
  loop = false,
  onEnded,
}: {
  className?: string;
  loop?: boolean;
  onEnded?: () => void;
}) {
  return (
    <video
      src="/vccp-media-logo-animation.mp4"
      autoPlay
      muted
      playsInline
      loop={loop}
      onEnded={onEnded}
      className={`object-contain ${className}`}
    />
  );
}
