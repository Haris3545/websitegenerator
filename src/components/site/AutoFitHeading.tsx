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
    return () => resizeObserver.disconnect();
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
