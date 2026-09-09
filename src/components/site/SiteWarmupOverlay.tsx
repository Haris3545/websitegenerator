"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BrandLogoAnimation } from "@/components/BrandLogoAnimation";
import { TABS_BY_KEY, orderedEnabledTabs } from "@/lib/tabs";
import type { TabKey } from "@/lib/database.types";

type Status = "pending" | "running" | "done" | "error";

const WARM_SECONDS_PER_TAB = 1.4;

function StatusIcon({ status }: { status: Status }) {
  if (status === "done") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-emerald-400" aria-hidden>
        <path d="M4 10.5 8 14l8-8" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "error") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-amber-400" aria-hidden>
        <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "running") {
    return <span className="block h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />;
  }
  return <span className="block h-4 w-4 rounded-full border-2 border-white/10" />;
}

/** The actual per-route warm-up, split out from the ?warming param check
 * below so useSearchParams (which needs a Suspense boundary) doesn't force
 * the whole overlay — including its "nothing to show" null case — behind
 * one. */
function WarmupRun({ slug, enabledTabs }: { slug: string; enabledTabs: TabKey[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [elapsedMs, setElapsedMs] = useState(0);
  const [done, setDone] = useState(false);

  const tabs = orderedEnabledTabs(enabledTabs);

  useEffect(() => {
    let cancelled = false;
    const start = performance.now();
    const interval = setInterval(() => setElapsedMs(performance.now() - start), 200);

    async function run() {
      // Fired all at once — every enabled tab's route lambda gets a chance
      // to cold-start concurrently, rather than queued one after another,
      // and this is the FIRST real hit any of them have taken (the person
      // creating the artist is looking at this very page right now), so
      // there's nothing stale about the data these requests will read.
      await Promise.all(
        tabs.map(async (key) => {
          setStatuses((prev) => ({ ...prev, [key]: "running" }));
          const tab = TABS_BY_KEY[key];
          const url = `${window.location.origin}/s/${slug}${tab.path ? `/${tab.path}` : ""}`;
          try {
            const res = await fetch(url, { cache: "no-store" });
            if (cancelled) return;
            setStatuses((prev) => ({ ...prev, [key]: res.ok ? "done" : "error" }));
          } catch {
            if (cancelled) return;
            setStatuses((prev) => ({ ...prev, [key]: "error" }));
          }
        })
      );
      if (cancelled) return;
      clearInterval(interval);
      setDone(true);
      // Strips the ?warming=1 flag without a full navigation — the current
      // page's own data was already loaded in the same request that
      // rendered this overlay, so there's nothing left to fetch for it.
      router.replace(pathname, { scroll: false });
    }

    run();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tabs is derived from enabledTabs on every render; including it would just re-trigger this identically
  }, [slug, enabledTabs, router, pathname]);

  const finishedCount = Object.values(statuses).filter((s) => s === "done" || s === "error").length;
  const progress = done ? 1 : finishedCount / tabs.length;
  const runningTab = tabs.find((key) => statuses[key] === "running");

  const staticEstimateSec = Math.max(4, Math.round(tabs.length * WARM_SECONDS_PER_TAB));
  const etaLabel =
    finishedCount === 0
      ? `Usually takes about ${staticEstimateSec}s…`
      : (() => {
          const elapsedSec = elapsedMs / 1000;
          const projectedTotalSec = (elapsedSec / finishedCount) * tabs.length;
          const remainingSec = Math.max(0, Math.ceil(projectedTotalSec - elapsedSec));
          return remainingSec <= 1 ? "Almost done…" : `About ${remainingSec}s left…`;
        })();

  // Stays mounted (rather than unmounting the instant `done` flips) so the
  // ?warming=1 → clean-URL replace above never causes a visible flash back
  // to a half-warmed dashboard — router.replace and this fade are both
  // triggered from the same `done` transition, so they land together.
  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-neutral-950 px-4 py-10 text-white transition-opacity duration-300 ${
        done ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <BrandLogoAnimation className="h-16 w-16 invert" loop={!done} />
      <p className="text-lg font-semibold">Loading every page</p>

      <div className="w-full max-w-sm">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <p className="mt-2 text-center text-xs uppercase tracking-wide text-white/40">
          {done ? "Dashboard ready" : runningTab ? `Loading ${TABS_BY_KEY[runningTab].label}…` : "Loading every page…"}
        </p>
        {!done && <p className="mt-1 text-center text-[11px] text-white/30">{etaLabel}</p>}
      </div>

      <div className="flex w-full max-w-sm flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
        {tabs.map((key) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <span className="text-white/70">{TABS_BY_KEY[key].label}</span>
            <StatusIcon status={statuses[key] ?? "pending"} />
          </div>
        ))}
      </div>
    </div>
  );
}

function WarmupGate({ slug, enabledTabs }: { slug: string; enabledTabs: TabKey[] }) {
  const searchParams = useSearchParams();
  const [active] = useState(() => searchParams.get("warming") === "1");
  if (!active) return null;
  return <WarmupRun slug={slug} enabledTabs={enabledTabs} />;
}

/** Shown full-screen over the dashboard's very first real load — right
 * after an artist is created, the builder sends the newly opened site here
 * with `?warming=1` instead of trying (and, per feedback, reliably failing
 * to visibly show) a warm-up screen of its own before ever leaving the
 * builder. Every one of the 12 tab routes is its own serverless function
 * that hasn't been hit yet at that point, so this is what actually gets rid
 * of the cold-start delay the very first time someone clicks through them —
 * not a cosmetic delay, a real fetch of each tab's real page. Refreshing
 * this page later, or opening it without the flag, skips straight past this
 * (see WarmupGate) since by then every route has already been warmed once. */
export function SiteWarmupOverlay({ slug, enabledTabs }: { slug: string; enabledTabs: TabKey[] }) {
  return (
    <Suspense fallback={null}>
      <WarmupGate slug={slug} enabledTabs={enabledTabs} />
    </Suspense>
  );
}
