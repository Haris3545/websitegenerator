"use client";

import { useEffect, useMemo, useState } from "react";
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
  finalizeProvisioning,
  checkProvisionedData,
  type ProvisionResult,
} from "@/app/builder/provisionActions";

type StepStatus = "pending" | "running" | "done" | "error";

interface Step {
  key: string;
  label: string;
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
 * at creation is fine. */
export function ProvisioningOverlay({
  artistId,
  slug,
  artistName,
  youtubeChannelId,
  mode = "create",
  onComplete,
}: {
  artistId: string;
  slug: string;
  artistName: string;
  youtubeChannelId: string | null;
  mode?: "create" | "refresh";
  onComplete: () => void;
}) {
  const [statuses, setStatuses] = useState<Record<string, StepStatus>>({});
  const [phase, setPhase] = useState<"running" | "checking" | "done">("running");
  const [checkResults, setCheckResults] = useState<Record<string, number> | null>(null);

  const allSteps = useMemo<Step[]>(
    () => [
      { key: "media", label: "News & press coverage", checkKey: "media", run: () => provisionMedia(artistId, artistName) },
      { key: "events", label: "Tour dates", checkKey: "events", run: () => provisionEvents(artistId, artistName) },
      { key: "youtube", label: "YouTube channel stats", checkKey: "youtube", run: () => provisionYoutube(artistId, youtubeChannelId) },
      // The extra Gemini web sweep for a sparse-comments artist only ever
      // fires when mode is "create" — see provisionSocialListening's own
      // comment on why that's safe to pass unconditionally here rather
      // than needing its own separate create-only step.
      { key: "social", label: "Social listening", checkKey: "social", run: () => provisionSocialListening(artistId, artistName, mode === "create") },
      { key: "music", label: "Music & listener stats", checkKey: "music", run: () => provisionMusic(artistId, artistName) },
      { key: "genius", label: "Lyric annotations", run: () => provisionGenius(artistId, artistName) },
      { key: "sentiment", label: "Sentiment overview", run: () => provisionSentiment(artistId, artistName) },
      { key: "insights", label: "Dashboard insights", run: () => provisionInsights(artistId, artistName) },
      { key: "wikipedia", label: "Wikipedia trends", run: () => provisionWikipediaTrends(artistId, artistName) },
      { key: "themes", label: "Conversation themes", run: () => provisionConversationThemes(artistId, artistName) },
    ],
    [artistId, artistName, youtubeChannelId, mode]
  );
  const CREATE_ONLY_KEYS = ["sentiment", "insights", "wikipedia", "themes"];
  const steps = mode === "refresh" ? allSteps.filter((s) => !CREATE_ONLY_KEYS.includes(s.key)) : allSteps;

  useEffect(() => {
    let cancelled = false;
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));

    async function runStep(key: string) {
      setStatuses((prev) => ({ ...prev, [key]: "running" }));
      const result = await byKey[key].run();
      if (cancelled) return;
      setStatuses((prev) => ({ ...prev, [key]: result.ok ? "done" : "error" }));
    }

    async function run() {
      // media/events/youtube/social/music/genius are independent of each
      // other. Everything after that depends on some of it having already
      // landed: sentiment reads media_articles, insights reads sentiment
      // plus youtube/music/social's own tables, wikipedia reads back what
      // music just stored, and conversation themes reads
      // wikipedia+social+genius — so those four run afterward, in that
      // order (when they're running at all — see the mode="refresh"
      // filtering above, which skips all four as Gemini/quota-limited).
      await Promise.all(["media", "events", "youtube", "social", "music", "genius"].map(runStep));
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

      await finalizeProvisioning(slug);
      if (cancelled) return;

      setPhase("checking");
      const counts = await checkProvisionedData(artistId);
      if (cancelled) return;
      setCheckResults(counts);
      setPhase("done");
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `steps` is recomputed from these same deps every render; including it here would just re-trigger this identically
  }, [artistId, slug, mode, artistName, youtubeChannelId]);

  const finishedCount = Object.values(statuses).filter((s) => s === "done" || s === "error").length;
  const progress = phase === "done" ? 1 : finishedCount / steps.length;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-neutral-950 px-4 py-10 text-white">
      <BrandLogoAnimation className="h-16 w-16 invert" loop={phase !== "done"} />

      <div className="w-full max-w-sm">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-builder-accent transition-all duration-300 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <p className="mt-2 text-center text-xs uppercase tracking-wide text-white/40">
          {phase === "checking"
            ? "Confirming everything landed…"
            : phase === "done"
              ? "Dashboard ready"
              : mode === "refresh"
                ? "Refreshing the dashboard…"
                : "Setting up the dashboard…"}
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
        {steps.map((step) => (
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
          className="rounded-full bg-builder-accent px-6 py-2.5 text-sm font-semibold text-black transition-transform duration-150 ease-out hover:-translate-y-0.5"
        >
          Continue
        </button>
      )}
    </div>
  );
}
