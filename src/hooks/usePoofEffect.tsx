"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

const PoofContext = createContext<((x: number, y: number) => void) | null>(null);

const PARTICLE_COUNT = 8;
const POOF_DURATION_MS = 550;

function PoofBurst({ x, y }: { x: number; y: number }) {
  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
    // Alternating distances (rather than a uniform ring) so the burst
    // reads as an organic little poof instead of a perfect circle.
    const distance = i % 2 === 0 ? 30 : 42;
    return { dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance };
  });
  return (
    <div className="pointer-events-none fixed z-[200]" style={{ left: x, top: y }}>
      {particles.map((p, i) => (
        <span
          key={i}
          className="animate-poof-particle absolute -ml-1 -mt-1 h-2 w-2 rounded-full bg-white/80 shadow-[0_0_6px_rgba(255,255,255,0.6)]"
          style={
            {
              "--poof-x": `${p.dx}px`,
              "--poof-y": `${p.dy}px`,
              animationDelay: `${i * 0.01}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Provides a small "poof" particle-burst effect any descendant can fire at
 * an arbitrary screen point — used to give card deletion a bit of physical
 * feedback instead of the item just instantly vanishing. Mount once near
 * the root of a feature (e.g. IdeasBoard) and call useTriggerPoof() from
 * wherever a delete button lives, passing the click's clientX/clientY. */
export function PoofEffectProvider({ children }: { children: ReactNode }) {
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([]);

  function triggerPoof(x: number, y: number) {
    const id = Date.now() + Math.random();
    setBursts((prev) => [...prev, { id, x, y }]);
    window.setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== id));
    }, POOF_DURATION_MS);
  }

  return (
    <PoofContext.Provider value={triggerPoof}>
      {children}
      {bursts.map((b) => (
        <PoofBurst key={b.id} x={b.x} y={b.y} />
      ))}
    </PoofContext.Provider>
  );
}

export function useTriggerPoof() {
  const trigger = useContext(PoofContext);
  return trigger ?? (() => {});
}
