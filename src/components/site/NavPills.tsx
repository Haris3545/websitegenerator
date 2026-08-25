"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { TABS_BY_KEY, orderedEnabledTabs } from "@/lib/tabs";
import { useEditMode } from "@/components/site/EditModeContext";
import { updateTabOrder } from "@/app/s/[slug]/actions";
import { useDragReorder } from "@/hooks/useDragReorder";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import type { TabKey } from "@/lib/database.types";

const END = "__end__";

/** Fills the pill in left-to-right while its Link is actually navigating —
 * useLinkStatus() only ever reports true once real navigation latency is
 * happening (an already-prefetched route resolves before pending ever
 * flips), so this is silent on the fast path and only appears exactly when
 * there'd otherwise be a moment of "did that click register?" doubt. Eases
 * toward ~85% while pending (never claiming false certainty about how much
 * longer it'll take), then completes the moment the real page has arrived —
 * at which point the pill's own active styling (see the parent's `active`
 * check) already matches this overlay's colors, so nothing visibly jumps. */
function PillWipeFill({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  const prefersReducedMotion = usePrefersReducedMotion();
  const overlayRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number | null>(null);
  const valueRef = useRef(0);
  const wasPendingRef = useRef(false);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;

    if (prefersReducedMotion) {
      el.style.transition = "opacity 120ms ease-out";
      el.style.clipPath = "inset(0 0 0 0)";
      el.style.opacity = pending ? "1" : "0";
      return;
    }
    el.style.transition = "";

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    if (pending) {
      wasPendingRef.current = true;
      valueRef.current = 0;
      el.style.opacity = "1";
      const tick = () => {
        valueRef.current += (0.85 - valueRef.current) * 0.06;
        el.style.clipPath = `inset(0 ${100 - valueRef.current * 100}% 0 0)`;
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else if (wasPendingRef.current) {
      wasPendingRef.current = false;
      const tick = () => {
        valueRef.current += (1 - valueRef.current) * 0.25;
        if (1 - valueRef.current < 0.01) {
          el.style.clipPath = "inset(0 0 0 0)";
          el.style.opacity = "0";
          return;
        }
        el.style.clipPath = `inset(0 ${100 - valueRef.current * 100}% 0 0)`;
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [pending, prefersReducedMotion]);

  return (
    <span
      ref={overlayRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center whitespace-nowrap rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-black opacity-0"
      style={{ clipPath: "inset(0 100% 0 0)" }}
    >
      {label}
    </span>
  );
}

export function NavPills({
  slug,
  artistId,
  enabledTabs,
}: {
  slug: string;
  artistId: string;
  enabledTabs: TabKey[];
}) {
  const pathname = usePathname();
  const base = `/s/${slug}`;
  const { editMode } = useEditMode();
  const [, startTransition] = useTransition();

  const [tabs, setTabs] = useState<TabKey[]>(() => orderedEnabledTabs(enabledTabs));

  function persist(next: TabKey[]) {
    setTabs(next);
    startTransition(() => {
      updateTabOrder(artistId, next.filter((k) => k !== "dashboard"));
    });
  }

  const { draggingKey, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, consumeWasDragging } =
    useDragReorder((dragKey, overKey) => {
      if (!overKey || overKey === dragKey) return;
      const rest = tabs.filter((k) => k !== dragKey);
      const insertAt = overKey === END ? rest.length : rest.indexOf(overKey as TabKey);
      rest.splice(insertAt < 0 ? rest.length : insertAt, 0, dragKey as TabKey);
      persist(rest);
    });

  function remove(key: TabKey) {
    persist(tabs.filter((k) => k !== key));
  }

  return (
    <nav className="flex flex-wrap gap-2 px-6 py-4 sm:px-10">
      {tabs.map((key) => {
        const tab = TABS_BY_KEY[key];
        if (!tab) return null;
        const href = tab.path ? `${base}/${tab.path}` : base;
        const active = pathname === href;
        const draggableTab = editMode && key !== "dashboard";

        return (
          <div
            key={key}
            data-reorder-key={key}
            className={draggableTab ? "relative touch-none select-none" : "relative"}
            style={draggableTab ? { touchAction: "none" } : undefined}
            onPointerDown={draggableTab ? (e) => handlePointerDown(e, key) : undefined}
            onPointerMove={draggableTab ? handlePointerMove : undefined}
            onPointerUp={draggableTab ? handlePointerUp : undefined}
            onPointerCancel={draggableTab ? handlePointerCancel : undefined}
          >
            {draggableTab && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  remove(key);
                }}
                aria-label={`Remove ${tab.label} tab`}
                className="absolute -right-1.5 -top-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold leading-none text-white shadow hover:bg-red-400"
              >
                ×
              </button>
            )}
            <Link
              href={href}
              draggable={false}
              onClick={(e) => {
                if (draggableTab && consumeWasDragging()) e.preventDefault();
              }}
              className={`relative block whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out ${
                draggableTab ? "cursor-grab active:cursor-grabbing" : "active:scale-[0.97]"
              } ${draggingKey === key ? "opacity-40" : ""} ${
                active
                  ? "bg-[var(--accent)] text-black"
                  : "border border-white/30 text-white/90 hover:border-white/60 hover:bg-white/5"
              }`}
            >
              {tab.label}
              {!active && <PillWipeFill label={tab.label} />}
            </Link>
          </div>
        );
      })}
      {editMode && (
        <div
          data-reorder-key={END}
          className="flex items-center rounded-lg border border-dashed border-white/20 px-3 text-xs text-white/30"
        >
          drag to reorder · × to remove
        </div>
      )}
    </nav>
  );
}
