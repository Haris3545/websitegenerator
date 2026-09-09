"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrandLogoAnimation } from "@/components/BrandLogoAnimation";
import {
  provisionMedia,
  provisionEvents,
  provisionYoutube,
  provisionSocialListening,
  provisionMusic,
  provisionGenius,
  provisionWikipediaTrends,
  provisionConversationThemes,
  provisionSentiment,
  provisionInsights,
  provisionAudience,
  finalizeProvisioning,
  checkProvisionedData,
  type ProvisionResult,
} from "@/app/builder/provisionActions";
import { TABS_BY_KEY, orderedEnabledTabs } from "@/lib/tabs";
import type { TabKey } from "@/lib/database.types";

const MAX_STEP_RETRIES = 2;
const STEP_RETRY_DELAY_MS = 1200;
// Rough per-page cold-start budget used only for the initial "usually takes
// about..." estimate shown before any real page has finished loading — once
// the first one or two land, the live elapsed time replaces this with an
// actual extrapolation (see projectedRemainingSec below).
const WARM_SECONDS_PER_TAB = 1.4;

type StepStatus = "pending" | "running" | "done" | "error";

interface Step {
  key: string;
  label: string;
  /** A short present-continuous phrase shown as the overlay's live
   * commentary line while this step is running — distinct from `label`
   * (a noun phrase for the checklist row) since "News & press coverage"
   * reads fine as a list item but oddly as "what's happening right now". */
  commentary: string;
  checkKey?: keyof Awaited<ReturnType<typeof checkProvisionedData>>;
  run: () => Promise<ProvisionResult>;
}

function StatusIcon({ status }: { status: StepStatus }) {
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

/** Shown right after a brand-new artist is first saved (mode="create") or
 * when someone clicks "Refresh Everything" on the live site (mode="refresh")
 * — runs every data source eagerly with visible per-step progress, instead
 * of either leaving the live site to fetch everything lazily on first visit,
 * or (for a refresh) sitting behind one opaque multi-second await with just
 * a spinner in a button. Ends with a real check that rows landed in each
 * source's own table — not just that each step returned ok, since a step
 * can legitimately succeed while finding nothing to store.
 *
 * mode="refresh" deliberately skips the Wikipedia trends and conversation
 * themes steps (both back onto Gemini/quota-limited calls) — same reasoning
 * as refreshEverything() in app/s/[slug]/actions.ts, which this overlay
 * replaces the UI for: a repeatedly-clickable button on every artist's site
 * must never be what burns through those quotas, whereas running them once
 * at creation is fine.
 *
 * On mode="create" only, once the data itself has landed this also runs a
 * "warming" phase that actually requests every enabled tab's real page (not
 * a cosmetic delay) so each one's serverless route is already compiled and
 * running before the artist ever clicks into it — the dominant one-time
 * slowness right after creation is per-route cold starts, not the data
 * fetches themselves (those already read back what provisioning just
 * stored). A refreshed artist's site has necessarily been visited before,
 * so its routes are already warm and this phase is skipped entirely. */
export function ProvisioningOverlay({
  artistId,
  slug,
  artistName,
  youtubeChannelId,
  enabledTabs,
  mode = "create",
  onComplete,
}: {
  artistId: string;
  slug: string;
  artistName: string;
  youtubeChannelId: string | null;
  enabledTabs: TabKey[];
  mode?: "create" | "refresh";
  onComplete: () => void;
}) {
  const [statuses, setStatuses] = useState<Record<string, StepStatus>>({});
  const [warmStatuses, setWarmStatuses] = useState<Record<string, StepStatus>>({});
  const [warmElapsedMs, setWarmElapsedMs] = useState(0);
  const [phase, setPhase] = useState<"running" | "checking" | "warming" | "done">("running");
  const [checkResults, setCheckResults] = useState<Record<string, number> | null>(null);

  const warmTabs = useMemo(
    () => (mode === "create" ? orderedEnabledTabs(enabledTabs) : []),
    [mode, enabledTabs]
  );

  // Always-latest ref rather than calling onComplete straight from the
  // auto-advance effect below — onComplete is a fresh closure from the
  // caller every render, so depending on it directly there would restart
  // the timer on every re-render while already sitting at "done" (e.g. the
  // BrandLogoAnimation's own re-renders), and it would never actually fire.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  // Auto-advances once everything's confirmed landed, rather than waiting
  // on a manual "Continue" click — this is also what makes the second
  // browser tab opened on create (see ArtistForm's handleSubmit) actually
  // navigate to the finished site instead of sitting on its placeholder
  // for however long provisioning takes, unnoticed, until someone remembers
  // to come back to this tab and click through. A brief pause first so the
  // completed checklist is still readable for a moment rather than
  // vanishing the instant the last item lands.
  useEffect(() => {
    if (phase !== "done") return;
    const timer = setTimeout(() => onCompleteRef.current(), 1400);
    return () => clearTimeout(timer);
  }, [phase]);

  // Drives the live "About Ns left" estimate during warming — a plain
  // interval rather than deriving it from render timing, since this needs
  // to keep ticking even while every tab's fetch is in flight and nothing
  // else is re-rendering.
  useEffect(() => {
    if (phase !== "warming") return;
    const start = performance.now();
    const interval = setInterval(() => setWarmElapsedMs(performance.now() - start), 200);
    return () => clearInterval(interval);
  }, [phase]);

  const allSteps = useMemo<Step[]>(
    () => [
      {
        key: "media",
        label: "News & press coverage",
        commentary: "Collecting articles…",
        checkKey: "media",
        run: () => provisionMedia(artistId, artistName),
      },
      {
        key: "events",
        label: "Tour dates",
        commentary: "Finding tour dates…",
        checkKey: "events",
        run: () => provisionEvents(artistId, artistName),
      },
      {
        key: "youtube",
        label: "YouTube channel stats",
        commentary: "Linking the YouTube channel…",
        checkKey: "youtube",
        run: () => provisionYoutube(artistId, youtubeChannelId),
      },
      // The Reddit/web sweep (via Gemini) only ever fires when mode is
      // "create" — see provisionSocialListening's own comment on why that's
      // safe to pass unconditionally here rather than needing its own
      // separate create-only step.
      {
        key: "social",
        label: "Social listening",
        commentary: "Reading social chatter…",
        checkKey: "social",
        run: () => provisionSocialListening(artistId, artistName, mode === "create"),
      },
      {
        key: "music",
        label: "Music & listener stats",
        commentary: "Pulling streaming stats…",
        checkKey: "music",
        run: () => provisionMusic(artistId, artistName),
      },
      {
        key: "genius",
        label: "Lyric annotations",
        commentary: "Fetching lyric annotations…",
        run: () => provisionGenius(artistId, artistName),
      },
      {
        key: "sentiment",
        label: "Sentiment overview",
        commentary: "Gauging sentiment…",
        run: () => provisionSentiment(artistId, artistName),
      },
      {
        key: "insights",
        label: "Dashboard insights",
        commentary: "Creating dashboard insights…",
        run: () => provisionInsights(artistId, artistName),
      },
      {
        key: "wikipedia",
        label: "Wikipedia trends",
        commentary: "Tracking Wikipedia interest…",
        run: () => provisionWikipediaTrends(artistId, artistName),
      },
      {
        key: "themes",
        label: "Conversation themes",
        commentary: "Mapping conversation themes…",
        run: () => provisionConversationThemes(artistId, artistName),
      },
      {
        key: "audience",
        label: "Audience research",
        commentary: "Digesting audience research…",
        checkKey: "audience",
        run: () => provisionAudience(artistId, artistName),
      },
    ],
    [artistId, artistName, youtubeChannelId, mode]
  );
  const CREATE_ONLY_KEYS = ["sentiment", "insights", "wikipedia", "themes", "audience"];
  const steps = mode === "refresh" ? allSteps.filter((s) => !CREATE_ONLY_KEYS.includes(s.key)) : allSteps;

  useEffect(() => {
    let cancelled = false;
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));

    // A step failing on the first try is usually a transient blip (a cold
    // external API, a momentary network hiccup) rather than a permanent
    // one, and this overlay only ever runs once per artist — so it's worth
    // a couple of quiet retries before giving up and marking it "error",
    // rather than sailing straight through to "Dashboard ready" with that
    // source silently empty.
    async function runStep(key: string) {
      setStatuses((prev) => ({ ...prev, [key]: "running" }));
      let result = await byKey[key].run();
      let attempt = 0;
      while (!result.ok && attempt < MAX_STEP_RETRIES) {
        if (cancelled) return;
        await new Promise((resolve) => setTimeout(resolve, STEP_RETRY_DELAY_MS));
        if (cancelled) return;
        attempt += 1;
        result = await byKey[key].run();
      }
      if (cancelled) return;
      setStatuses((prev) => ({ ...prev, [key]: result.ok ? "done" : "error" }));
    }

    async function run() {
      // media/events/youtube/social/music/genius/audience are independent
      // of each other (audience's own Gemini research doesn't read back
      // anything else). Everything after that depends on some of it having
      // already landed: sentiment reads media_articles, insights reads
      // sentiment plus youtube/music/social's own tables, wikipedia reads
      // back what music just stored, and conversation themes reads
      // wikipedia+social+genius — so those four run afterward, in that
      // order (when they're running at all — see the mode="refresh"
      // filtering above, which skips all five as Gemini/quota-limited).
      // Filtered against byKey rather than assumed unconditionally present
      // since "audience" (like sentiment/insights/wikipedia/themes) isn't
      // in `steps` at all under mode="refresh".
      const parallelKeys = ["media", "events", "youtube", "social", "music", "genius", "audience"].filter(
        (key) => key in byKey
      );
      await Promise.all(parallelKeys.map(runStep));
      if (cancelled) return;
      if (mode === "create") {
        await runStep("sentiment");
        if (cancelled) return;
        await runStep("insights");
        if (cancelled) return;
        await runStep("wikipedia");
        if (cancelled) return;
        await runStep("themes");
        if (cancelled) return;
      }

      // Neither of these is a per-step result the checklist can show an
      // error icon for, and both are best-effort on top of work that's
      // already landed — so a throw here (a stale cache tag, a flaky count
      // query) must never leave the overlay stuck on "checking" forever
      // with no way for the user to get past it.
      try {
        await finalizeProvisioning(slug);
      } catch {
        // best-effort — worst case the site serves a stale cache until its next natural revalidation
      }
      if (cancelled) return;

      setPhase("checking");
      let counts: Record<string, number> = {};
      try {
        counts = await checkProvisionedData(artistId);
      } catch {
        // best-effort — fall through to "done" even if the verification query itself failed
      }
      if (cancelled) return;
      setCheckResults(counts);

      if (warmTabs.length > 0) {
        setPhase("warming");
        // Deliberately fired all at once rather than throttled — the whole
        // point is to get every route's lambda cold-starting concurrently
        // instead of one after another, and the data these pages read was
        // just written by the steps above, so each request is a real page
        // load, not a synthetic ping.
        await Promise.all(
          warmTabs.map(async (key) => {
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
          })
        );
        if (cancelled) return;
      }

      setPhase("done");
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `steps`/`warmTabs` are recomputed from these same deps every render; including them here would just re-trigger this identically
  }, [artistId, slug, mode, artistName, youtubeChannelId, warmTabs]);

  const finishedCount = Object.values(statuses).filter((s) => s === "done" || s === "error").length;
  const warmFinishedCount = Object.values(warmStatuses).filter((s) => s === "done" || s === "error").length;
  const progress =
    phase === "done"
      ? 1
      : phase === "warming"
        ? warmFinishedCount / warmTabs.length
        : finishedCount / steps.length;
  // Several steps run in parallel (see the run() effect above), so more
  // than one can be "running" at once — showing whichever comes first in
  // declaration order keeps the commentary line to a single steady phrase
  // instead of flickering between several.
  const runningCommentary = steps.find((s) => statuses[s.key] === "running")?.commentary;
  const warmingTab = warmTabs.find((key) => warmStatuses[key] === "running");

  // Before any page has finished loading there's nothing to extrapolate
  // from, so the estimate starts as a flat per-tab budget; once at least
  // one has landed, the live elapsed time gives a real (and steadily more
  // accurate) projection of what's left instead.
  const warmStaticEstimateSec = Math.max(4, Math.round(warmTabs.length * WARM_SECONDS_PER_TAB));
  const warmEtaLabel =
    warmFinishedCount === 0
      ? `Usually takes about ${warmStaticEstimateSec}s…`
      : (() => {
          const elapsedSec = warmElapsedMs / 1000;
          const projectedTotalSec = (elapsedSec / warmFinishedCount) * warmTabs.length;
          const remainingSec = Math.max(0, Math.ceil(projectedTotalSec - elapsedSec));
          return remainingSec <= 1 ? "Almost done…" : `About ${remainingSec}s left…`;
        })();

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-neutral-950 px-4 py-10 text-white">
      <BrandLogoAnimation className="h-16 w-16 invert" loop={phase !== "done"} />

      <p className="text-lg font-semibold">
        {phase === "warming"
          ? "Loading every page"
          : mode === "refresh"
            ? "Refreshing everything"
            : "Creating website"}
      </p>

      <div className="w-full max-w-sm">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-builder-accent transition-[width] duration-300 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <p
          key={phase}
          className={`mt-2 text-center text-xs uppercase tracking-wide text-white/40 ${
            phase === "done" ? "animate-provisioning-done-in" : ""
          }`}
        >
          {phase === "checking"
            ? "Confirming everything landed…"
            : phase === "warming"
              ? (warmingTab ? `Loading ${TABS_BY_KEY[warmingTab].label}…` : "Loading every page…")
              : phase === "done"
                ? "Dashboard ready"
                : (runningCommentary ?? (mode === "refresh" ? "Refreshing the dashboard…" : "Setting up the dashboard…"))}
        </p>
        {phase === "warming" && (
          <p className="mt-1 text-center text-[11px] text-white/30">{warmEtaLabel}</p>
        )}
      </div>

      <div className="flex w-full max-w-sm flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
        {phase === "warming"
          ? warmTabs.map((key) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-white/70">{TABS_BY_KEY[key].label}</span>
                <StatusIcon status={warmStatuses[key] ?? "pending"} />
              </div>
            ))
          : steps.map((step) => (
              <div key={step.key} className="flex items-center justify-between gap-3">
                <span className="text-white/70">{step.label}</span>
                <div className="flex items-center gap-2">
                  {phase === "done" && checkResults && step.checkKey && (
                    <span className="text-xs text-white/35">
                      {checkResults[step.checkKey]} {checkResults[step.checkKey] === 1 ? "item" : "items"}
                    </span>
                  )}
                  <StatusIcon status={statuses[step.key] ?? "pending"} />
                </div>
              </div>
            ))}
      </div>

      {phase === "done" && (
        <button
          type="button"
          onClick={onComplete}
          className="animate-provisioning-done-in rounded-full bg-builder-accent px-6 py-2.5 text-sm font-semibold text-black transition-transform duration-150 ease-out [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-0.5 active:scale-[0.97]"
          style={{ animationDelay: "150ms", animationFillMode: "backwards" }}
        >
          Continue now
        </button>
      )}
    </div>
  );
}
