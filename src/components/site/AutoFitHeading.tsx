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
    // font, since the artist's Google Font is loaded via a <link> tag the
    // page inserts itself, and its @font-face rule isn't even parsed yet at
    // mount time. document.fonts.ready alone isn't reliable here: called
    // this early, the browser may not have registered that font's FontFace
    // in document.fonts yet (the external stylesheet hasn't been fetched),
    // so `ready` can resolve near-instantly against an empty/incomplete set
    // instead of actually waiting for it — a one-shot check has nothing left
    // to catch the swap once it does happen later. Listening for the
    // FontFaceSet's own 'loadingdone' event instead re-fits every time any
    // batch of font loads finishes, however late, for as long as this
    // component stays mounted — this is what was showing as the title
    // overflowing or off-centre until a manual resize/refresh forced a
    // re-measure against the real, final glyph widths.
    let cancelled = false;
    if (typeof document !== "undefined" && "fonts" in document) {
      const onFontsChange = () => {
        if (!cancelled) fit();
      };
      document.fonts.addEventListener("loadingdone", onFontsChange);
      document.fonts.ready.then(onFontsChange);

      return () => {
        cancelled = true;
        document.fonts.removeEventListener("loadingdone", onFontsChange);
        resizeObserver.disconnect();
        window.removeEventListener("resize", fit);
        cancelAnimationFrame(rafId);
      };
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
