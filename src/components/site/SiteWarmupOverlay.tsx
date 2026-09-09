"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BrandLogoAnimation } from "@/components/BrandLogoAnimation";
import {
  provisionMedia,
  provisionEvents,
  provisionYoutube,
  provisionSocialListening,
  provisionMusic,
  finalizeProvisioning,
} from "@/app/builder/provisionActions";
import { TABS_BY_KEY, orderedEnabledTabs } from "@/lib/tabs";
import type { TabKey } from "@/lib/database.types";

type Status = "pending" | "running" | "done" | "error";

const WARM_SECONDS_PER_TAB = 1.4;

const REFRESH_STEPS: { key: string; label: string; run: (artistId: string, artistName: string, youtubeChannelId: string | null) => Promise<{ ok: boolean }> }[] = [
  { key: "media", label: "News & press coverage", run: (id, name) => provisionMedia(id, name) },
  { key: "events", label: "Tour dates", run: (id, name) => provisionEvents(id, name) },
  { key: "youtube", label: "YouTube channel stats", run: (id, _name, yt) => provisionYoutube(id, yt) },
  // includeWebSweep stays false here — that Reddit/web sweep already ran
  // once during creation (see ProvisioningOverlay's mode="create"), and
  // this embedded refresh can run on every fresh site open, so repeating
  // it here would burn the shared Gemini quota every time.
  { key: "social", label: "Social listening", run: (id, name) => provisionSocialListening(id, name, false) },
  { key: "music", label: "Music & listener stats", run: (id, name) => provisionMusic(id, name) },
];

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

function ChecklistCard({ items }: { items: { key: string; label: string; status: Status }[] }) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
      {items.map((item) => (
        <div key={item.key} className="flex items-center justify-between gap-3">
          <span className="text-white/70">{item.label}</span>
          <StatusIcon status={item.status} />
        </div>
      ))}
    </div>
  );
}

/** The actual warm-up run, split out from the ?warming param check below so
 * useSearchParams (which needs a Suspense boundary) doesn't force the whole
 * overlay — including its "nothing to show" null case — behind one.
 *
 * Two phases, in order: "refreshing" (only when the caller passed
 * ?refresh=1 too — see the doc comment on SiteWarmupOverlay below for why
 * that's create-only) re-fetches the same data sources a manual "Refresh
 * Everything" click would, so a brand-new artist's articles/tour
 * dates/etc. are actually there — not just whatever provisioning during
 * creation happened to land — before the page-by-page warm-up even starts;
 * "warming" then hits every enabled tab's real page so each one's
 * serverless route is already compiled by the time it's clicked. */
function WarmupRun({
  slug,
  enabledTabs,
  shouldRefresh,
  artistId,
  artistName,
  youtubeChannelId,
}: {
  slug: string;
  enabledTabs: TabKey[];
  shouldRefresh: boolean;
  artistId: string;
  artistName: string;
  youtubeChannelId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<"refreshing" | "warming" | "done">(shouldRefresh ? "refreshing" : "warming");
  const [refreshStatuses, setRefreshStatuses] = useState<Record<string, Status>>({});
  const [warmStatuses, setWarmStatuses] = useState<Record<string, Status>>({});
  const [elapsedMs, setElapsedMs] = useState(0);
  const [done, setDone] = useState(false);

  const tabs = orderedEnabledTabs(enabledTabs);

  useEffect(() => {
    let cancelled = false;
    const start = performance.now();
    const interval = setInterval(() => setElapsedMs(performance.now() - start), 200);

    async function run() {
      if (shouldRefresh) {
        await Promise.all(
          REFRESH_STEPS.map(async (step) => {
            setRefreshStatuses((prev) => ({ ...prev, [step.key]: "running" }));
            try {
              const result = await step.run(artistId, artistName, youtubeChannelId);
              if (cancelled) return;
              setRefreshStatuses((prev) => ({ ...prev, [step.key]: result.ok ? "done" : "error" }));
            } catch {
              if (cancelled) return;
              setRefreshStatuses((prev) => ({ ...prev, [step.key]: "error" }));
            }
          })
        );
        if (cancelled) return;
        try {
          await finalizeProvisioning(slug);
        } catch {
          // best-effort — worst case the pages below read a stale cache until its next natural revalidation
        }
        if (cancelled) return;
        setPhase("warming");
      }

      // One at a time, deliberately — each tab's page is only marked done
      // once its own request has actually resolved, so the checklist always
      // reflects a real, completed load of that exact page rather than a
      // burst of requests that all happen to land around the same time.
      for (const key of tabs) {
        if (cancelled) return;
        setWarmStatuses((prev) => ({ ...prev, [key]: "running" }));
        const tab = TABS_BY_KEY[key];
        const url = `${window.location.origin}/s/${slug}${tab.path ? `/${tab.path}` : ""}`;
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (cancelled) return;
          setWarmStatuses((prev) => ({ ...prev, [key]: res.ok ? "done" : "error" }));
        } catch {
          if (cancelled) return;
          setWarmStatuses((prev) => ({ ...prev, [key]: "error" }));
        }
      }
      if (cancelled) return;
      clearInterval(interval);
      setPhase("done");
      setDone(true);
      // Strips the ?warming=1 (and ?refresh=1) flags. Plain warming (no
      // refresh) has nothing left to fetch here — the current page's own
      // data was already loaded in the same request that rendered this
      // overlay — so replace() alone is enough. But when shouldRefresh ran,
      // that data was fetched *after* this page's own server render, so the
      // dashboard sitting underneath this overlay is still showing what it
      // looked like before the refresh — router.refresh() re-runs this
      // page's own server-side data fetch so what's revealed underneath is
      // actually current, not last-request-stale.
      router.replace(pathname, { scroll: false });
      if (shouldRefresh) router.refresh();
    }

    run();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tabs/shouldRefresh are derived from props on every render; including them would just re-trigger this identically
  }, [slug, enabledTabs, artistId, artistName, youtubeChannelId, router, pathname]);

  const activeItems =
    phase === "refreshing"
      ? REFRESH_STEPS.map((s) => ({ key: s.key, label: s.label, status: refreshStatuses[s.key] ?? "pending" }))
      : tabs.map((key) => ({ key, label: TABS_BY_KEY[key].label, status: warmStatuses[key] ?? "pending" }));

  const finishedCount = activeItems.filter((i) => i.status === "done" || i.status === "error").length;
  const progress = done ? 1 : finishedCount / activeItems.length;
  const runningItem = activeItems.find((i) => i.status === "running");

  const staticEstimateSec = Math.max(4, Math.round(activeItems.length * WARM_SECONDS_PER_TAB));
  const etaLabel =
    finishedCount === 0
      ? `Usually takes about ${staticEstimateSec}s…`
      : (() => {
          const elapsedSec = elapsedMs / 1000;
          const projectedTotalSec = (elapsedSec / finishedCount) * activeItems.length;
          const remainingSec = Math.max(0, Math.ceil(projectedTotalSec - elapsedSec));
          return remainingSec <= 1 ? "Almost done…" : `About ${remainingSec}s left…`;
        })();

  const headline = phase === "refreshing" ? "Refreshing your data" : "Loading every page";

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
      <p className="text-lg font-semibold">{done ? "Loading every page" : headline}</p>

      <div className="w-full max-w-sm">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <p className="mt-2 text-center text-xs uppercase tracking-wide text-white/40">
          {done ? "Dashboard ready" : runningItem ? `Loading ${runningItem.label}…` : `${headline}…`}
        </p>
        {!done && <p className="mt-1 text-center text-[11px] text-white/30">{etaLabel}</p>}
      </div>

      <ChecklistCard items={activeItems} />
    </div>
  );
}

function WarmupGate({
  slug,
  enabledTabs,
  artistId,
  artistName,
  youtubeChannelId,
}: {
  slug: string;
  enabledTabs: TabKey[];
  artistId: string;
  artistName: string;
  youtubeChannelId: string | null;
}) {
  const searchParams = useSearchParams();
  const [active] = useState(() => searchParams.get("warming") === "1");
  const [shouldRefresh] = useState(() => searchParams.get("refresh") === "1");
  if (!active) return null;
  return (
    <WarmupRun
      slug={slug}
      enabledTabs={enabledTabs}
      shouldRefresh={shouldRefresh}
      artistId={artistId}
      artistName={artistName}
      youtubeChannelId={youtubeChannelId}
    />
  );
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
 * (see WarmupGate) since by then every route has already been warmed once.
 *
 * `?refresh=1` (only ever sent alongside `?warming=1` right after creation
 * — see ArtistForm.tsx) additionally re-runs the same data sources a manual
 * "Refresh Everything" click would, before any page gets warmed. Existing
 * artists opened via "View site" only ever get plain `?warming=1`: their
 * data isn't first-run-flaky the way a just-created artist's can be, and
 * re-fetching everything on every casual revisit would burn API quota for
 * no benefit. */
export function SiteWarmupOverlay({
  slug,
  enabledTabs,
  artistId,
  artistName,
  youtubeChannelId,
}: {
  slug: string;
  enabledTabs: TabKey[];
  artistId: string;
  artistName: string;
  youtubeChannelId: string | null;
}) {
  return (
    <Suspense fallback={null}>
      <WarmupGate
        slug={slug}
        enabledTabs={enabledTabs}
        artistId={artistId}
        artistName={artistName}
        youtubeChannelId={youtubeChannelId}
      />
    </Suspense>
  );
}
