"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Shrinks its own font size until the text fits on one line within its
 * container, rather than the previous approach of a handful of discrete
 * Tailwind size classes tiered by character count — which still had to
 * truncate with an ellipsis as a last resort on narrow screens, since any
 * fixed set of tiers eventually runs out of room. This measures the real
 * rendered width and always finds a size that fits (down to minFontSizePx),
 * so long titles never get cut off, they just get smaller. */
export function AutoFitHeading({
  children,
  maxFontSizePx,
  minFontSizePx,
  className,
  style,
}: {
  children: string;
  maxFontSizePx: number;
  minFontSizePx: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLHeadingElement>(null);
  const [fontSize, setFontSize] = useState(maxFontSizePx);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const el = textRef.current;
    if (!container || !el) return;

    function fit() {
      if (!container || !el) return;
      el.style.fontSize = `${maxFontSizePx}px`;
      const containerWidth = container.clientWidth;
      const textWidth = el.scrollWidth;
      const next =
        textWidth > containerWidth && containerWidth > 0
          ? Math.max(minFontSizePx, maxFontSizePx * (containerWidth / textWidth))
          : maxFontSizePx;
      setFontSize(next);
      el.style.fontSize = `${next}px`;
    }

    fit();
    const resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(container);
    // Belt-and-suspenders alongside the ResizeObserver above: a browser
    // window that opens directly into (or gets OS-snapped into) a
    // split-screen layout can settle its final size a beat after first
    // paint, and some browser/OS combinations don't always fire a
    // ResizeObserver entry for that settle. A plain window resize listener
    // plus one rAF-delayed re-fit after mount catches that case too.
    window.addEventListener("resize", fit);
    const rafId = requestAnimationFrame(fit);

    // The very first fit() run measures scrollWidth using whatever font is
    // actually painted at that instant — almost always a fallback system
    // font, since the artist's Google Font is still loading via the <link>
    // tag in the layout. Once that swaps in, character widths change (this
    // is what was showing as the title being "off-centre" or overflowing
    // until a resize/refresh forced a re-measure): a resize event never
    // fires just because a font finished loading, so nothing re-triggered
    // fit() on its own. document.fonts.ready resolves once every requested
    // font face has either loaded or failed, so this re-fits against the
    // real, final metrics without waiting on user interaction.
    let cancelled = false;
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(() => {
        if (!cancelled) fit();
      });
    }

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      window.removeEventListener("resize", fit);
      cancelAnimationFrame(rafId);
    };
  }, [children, maxFontSizePx, minFontSizePx]);

  return (
    <div ref={containerRef} className="w-full">
      <h1
        ref={textRef}
        className={className}
        style={{ ...style, fontSize, whiteSpace: "nowrap", display: "block", textAlign: "inherit" }}
      >
        {children}
      </h1>
    </div>
  );
}
