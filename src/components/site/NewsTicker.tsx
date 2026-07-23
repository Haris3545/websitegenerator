"use client";

import { useEffect, useRef } from "react";
import type { MediaArticle } from "@/lib/database.types";

const BASE_SPEED_PX_PER_SEC = 40;

export function NewsTicker({ articles }: { articles: MediaArticle[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const velocityRef = useRef(BASE_SPEED_PX_PER_SEC);
  const targetRef = useRef(BASE_SPEED_PX_PER_SEC);
  const offsetRef = useRef(0);

  useEffect(() => {
    if (!articles.length) return;
    let raf: number;
    let last = performance.now();

    function tick(now: number) {
      const dt = (now - last) / 1000;
      last = now;

      // Ease current speed toward target (hover = 0, otherwise base speed).
      velocityRef.current += (targetRef.current - velocityRef.current) * Math.min(1, dt * 2);
      offsetRef.current -= velocityRef.current * dt;

      const track = trackRef.current;
      if (track) {
        const halfWidth = track.scrollWidth / 2;
        if (halfWidth > 0 && Math.abs(offsetRef.current) >= halfWidth) {
          offsetRef.current += halfWidth;
        }
        track.style.transform = `translateX(${offsetRef.current}px)`;
      }
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [articles.length]);

  if (!articles.length) return null;

  // Duplicate the list so the translateX loop has no visible seam.
  const loopItems = [...articles, ...articles];

  return (
    <div
      className="relative overflow-hidden border-y border-white/10 bg-black/30 py-2"
      onMouseEnter={() => (targetRef.current = 0)}
      onMouseLeave={() => (targetRef.current = BASE_SPEED_PX_PER_SEC)}
    >
      <div ref={trackRef} className="flex w-max gap-10 whitespace-nowrap px-6 will-change-transform">
        {loopItems.map((article, i) => (
          <a
            key={`${article.id}-${i}`}
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-sm text-white/80 hover:text-white"
          >
            <span className="rounded-full border border-white/20 px-2 py-0.5 text-xs text-white/60">
              {article.source}
            </span>
            <span>{article.title}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
