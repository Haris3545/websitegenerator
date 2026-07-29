"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ColorField } from "@/components/builder/ColorField";
import { FontPicker } from "@/components/builder/FontPicker";
import { BackgroundMediaField } from "@/components/builder/BackgroundMediaField";
import { AudienceUploadField } from "@/components/builder/AudienceUploadField";
import { TabsChecklist } from "@/components/builder/TabsChecklist";
import { ThemeEditor } from "@/components/builder/ThemeEditor";
import {
  upsertArtist,
  uploadAudienceResearch,
  lookupYoutubeChannel,
  publishArtist,
  unpublishArtist,
  checkPublishStatus,
  type ArtistFormInput,
} from "@/app/builder/actions";
import type { Artist } from "@/lib/database.types";
import { DEFAULT_THEME_OVERRIDES, type ThemeOverrides } from "@/lib/theme";
import { computeArtistPassword } from "@/lib/artistAccess";
import { grainTexture } from "@/lib/grainTexture";
import { BrandLogoAnimation } from "@/components/BrandLogoAnimation";
import { ProvisioningOverlay } from "@/components/builder/ProvisioningOverlay";
import { YoutubeIcon } from "@/components/builder/YoutubeIcon";
import { HelpTooltip } from "@/components/builder/HelpTooltip";
import { averageColorFromImageUrl } from "@/lib/colorFromImage";
import { searchYoutubeVideosAction } from "@/app/builder/searchActions";
import type { YoutubeVideoSearchResult } from "@/lib/youtube";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function isGateVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

const inputClass =
  "rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 placeholder-neutral-400 transition-shadow duration-150 focus:border-builder-accent focus:shadow-[0_0_0_3px_rgba(255,201,49,0.2)] focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-white/30";
const labelClass = "text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-white/50";
const sectionClass =
  "flex flex-col gap-5 rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/10 dark:bg-white/[0.025]";

function Section({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className={`${sectionClass} scroll-mt-28`}>
      <div>
        <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-white">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-neutral-500 dark:text-white/40">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

export function ArtistForm({ artist }: { artist?: Artist }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<ArtistFormInput>({
    id: artist?.id,
    slug: artist?.slug ?? "",
    name: artist?.name ?? "",
    primary_color: artist?.primary_color ?? "#eab308",
    accent_color: artist?.accent_color ?? "#eab308",
    font_family: artist?.font_family ?? "Inter",
    background_image_url: artist?.background_image_url ?? null,
    gate_background_url: artist?.gate_background_url ?? null,
    gate_scrim_opacity: artist?.gate_scrim_opacity ?? 0.55,
    gate_grain_intensity: artist?.gate_grain_intensity ?? 0,
    gate_grain_monochrome: artist?.gate_grain_monochrome ?? false,
    youtube_channel_id: artist?.youtube_channel_id ?? null,
    aesthetic_prompt: artist?.aesthetic_prompt ?? "",
    aesthetic_params: artist?.aesthetic_params ?? {},
    tagline: artist?.tagline ?? "VCCP Cultural Intelligence",
    project_title: artist?.project_title ?? "The Recording Studio",
    theme_overrides: artist?.theme_overrides ?? DEFAULT_THEME_OVERRIDES,
    enabled_tabs: artist?.enabled_tabs ?? [
      "dashboard",
      "media",
      "social_listening",
      "music",
      "youtube",
      "audience",
      "strategy",
      "tactics",
      "locations",
      "ideas",
      "calendar",
      "research",
    ],
  });
  const [slugTouched, setSlugTouched] = useState(!!artist);
  const [audienceFile, setAudienceFile] = useState<File | null>(null);
  const [youtubeUrlInput, setYoutubeUrlInput] = useState("");
  const [isLookingUpYoutube, startYoutubeLookup] = useTransition();
  const [youtubeLookup, setYoutubeLookup] = useState<
    { status: "success"; channelTitle: string } | { status: "error"; error: string } | null
  >(null);
  // Typing a name (rather than pasting a link) live-searches instead of
  // requiring a separate "Search YouTube" button/modal — one box handles
  // both ways of finding a channel.
  const [channelResults, setChannelResults] = useState<YoutubeVideoSearchResult[]>([]);
  const [searchingChannels, setSearchingChannels] = useState(false);
  const [channelDropdownOpen, setChannelDropdownOpen] = useState(false);
  const channelSearchDebounceRef = useRef<number | null>(null);
  const channelSearchRequestIdRef = useRef(0);
  // Lifted straight from the channel's own avatar once a lookup resolves
  // one — a suggestion the "Use" button below applies deliberately, never
  // silently, since accent_color may already be something someone chose on
  // purpose.
  const [suggestedAccent, setSuggestedAccent] = useState<string | null>(null);
  const [edgeCasesOpen, setEdgeCasesOpen] = useState(!!artist?.aesthetic_prompt?.trim());
  // Collapsed by default — see the disclosure itself for why.
  const [tabsChecklistOpen, setTabsChecklistOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [published, setPublished] = useState<{ repoUrl: string; siteUrl: string } | null>(
    artist?.published_repo_url && artist?.published_site_url
      ? { repoUrl: artist.published_repo_url, siteUrl: artist.published_site_url }
      : null
  );
  // "queued"/"building" drive the progress bar below and get polled every
  // few seconds; "ready" stops polling and shows the live link as
  // confirmed-working rather than just assumed. Starting at "queued"
  // whenever a deployment id is on record (not just right after a fresh
  // publish click) means reloading the builder mid-build still picks the
  // polling back up instead of just showing a stale "Published" state.
  const [deployStatus, setDeployStatus] = useState<
    "idle" | "queued" | "building" | "ready" | "error" | "unknown"
  >(() => {
    if (!artist?.published_repo_url || !artist?.published_site_url) return "idle";
    return artist.published_deployment_id ? "queued" : "unknown";
  });
  // A plain one-time initializer here meant this never moved again after
  // the component first mounted — unpublishing and republishing without a
  // full page reload (the same ArtistForm instance stays mounted the whole
  // time) kept ticking up from whenever the page originally loaded instead
  // of restarting from the new publish click, which is what made the
  // elapsed-time readout look like it "didn't reset."
  const [deployStartedAt, setDeployStartedAt] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Explicit "Save progress" + silent autosave both funnel through here, so
  // a brand-new artist can be saved at any point in the form, not just at
  // the final submit at the bottom. Refs (not state) hold the current id
  // and form so this reads the truly latest values regardless of how many
  // renders happened since it was scheduled — using stale closed-over state
  // here is exactly what would risk inserting a duplicate row on a second
  // quick save.
  const idRef = useRef(artist?.id);
  const [savedArtistId, setSavedArtistId] = useState(artist?.id);
  const formRef = useRef(form);
  const savingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "error">(
    "idle"
  );
  const isFirstRender = useRef(true);
  const [provisioning, setProvisioning] = useState<{
    artistId: string;
    slug: string;
    artistName: string;
    youtubeChannelId: string | null;
  } | null>(null);
  const provisioningCompleteRef = useRef<() => void>(() => {});

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  const saveProgress = useCallback(async () => {
    if (savingRef.current) {
      pendingSaveRef.current = true;
      return;
    }
    do {
      pendingSaveRef.current = false;
      const current = formRef.current;
      if (!current.name.trim() || !current.slug.trim()) break;

      savingRef.current = true;
      setSaveStatus("saving");
      const result = await upsertArtist({ ...current, id: idRef.current });
      savingRef.current = false;

      if (!result.ok) {
        setSaveStatus("error");
        setFormError(result.error);
        break;
      }
      setFormError(null);
      setSaveStatus("saved");
      const wasNew = !idRef.current;
      idRef.current = result.id;
      setSavedArtistId(result.id);
      if (wasNew) router.replace(`/builder/artists/${result.id}`);
    } while (pendingSaveRef.current);
  }, [router]);

  // Debounced autosave: after a pause in typing (with no setState in the
  // effect body itself — the "dirty" status is set synchronously inside
  // update() below, the one true event-handler entry point for every field
  // change), fire a silent save. Skips its very first run so simply opening
  // an existing artist's edit page doesn't trigger an immediate needless
  // save.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!form.name.trim() || !form.slug.trim()) return;
    const timer = setTimeout(() => {
      void saveProgress();
    }, 2500);
    return () => clearTimeout(timer);
  }, [form, saveProgress]);

  function update<K extends keyof ArtistFormInput>(key: K, value: ArtistFormInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaveStatus("dirty");
  }

  // Password page background gets its own pan/zoom, independent of the
  // dashboard background's (ThemeEditor's bg_position_x/y/bg_zoom) — same
  // storage (theme_overrides) and drag mechanics as that editor, just scoped
  // to the gate preview below instead of a click-to-select part of it.
  function setGateTheme(patch: Partial<ThemeOverrides>) {
    update("theme_overrides", { ...form.theme_overrides, ...patch });
  }
  const gateTheme = { ...DEFAULT_THEME_OVERRIDES, ...form.theme_overrides };
  const [gateDragging, setGateDragging] = useState(false);
  const gateDragState = useRef<{
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
    moved: boolean;
  } | null>(null);

  function handleGatePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!form.gate_background_url) return;
    gateDragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: gateTheme.gate_bg_position_x,
      startPosY: gateTheme.gate_bg_position_y,
      moved: false,
    };
  }

  function handleGatePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const ds = gateDragState.current;
    if (!ds) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    if (!ds.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      ds.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setGateDragging(true);
    }
    if (!ds.moved) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const overflowX = rect.width * 0.4;
    const overflowY = rect.height * 0.4;
    setGateTheme({
      gate_bg_position_x: Math.round(clamp(ds.startPosX - (dx / overflowX) * 100, 0, 100)),
      gate_bg_position_y: Math.round(clamp(ds.startPosY - (dy / overflowY) * 100, 0, 100)),
    });
  }

  function handleGatePointerUp() {
    gateDragState.current = null;
    setGateDragging(false);
  }

  function handleNameChange(name: string) {
    update("name", name);
    if (!slugTouched) update("slug", slugify(name));
  }

  // Shared by both ways of resolving a channel (pasted link and search-modal
  // pick) — besides linking the channel id, it lifts a suggested accent
  // colour straight from the channel's own avatar so there's at least a
  // starting point that already matches their branding instead of a blind
  // colour-wheel guess. Only ever offered as a one-click suggestion (see the
  // "Use" button below), never applied automatically — accent_color may
  // already be something someone chose on purpose.
  function applyYoutubeLookupResult(lookupResult: Awaited<ReturnType<typeof lookupYoutubeChannel>>) {
    if (lookupResult.ok) {
      update("youtube_channel_id", lookupResult.channelId);
      setYoutubeLookup({ status: "success", channelTitle: lookupResult.channelTitle });
      setSuggestedAccent(null);
      if (lookupResult.channelThumbnail) {
        void averageColorFromImageUrl(lookupResult.channelThumbnail).then(setSuggestedAccent);
      }
    } else {
      setYoutubeLookup({ status: "error", error: lookupResult.error });
    }
  }

  // A pasted link/handle resolves directly (no point searching "https://…"
  // as if it were a channel name) — anything else is treated as a name to
  // search live as they type.
  function looksLikeYoutubeLink(v: string): boolean {
    return /^(https?:\/\/|www\.|youtube\.com|youtu\.be|@)/i.test(v.trim());
  }

  function handleChannelQueryChange(next: string) {
    setYoutubeUrlInput(next);
    setYoutubeLookup(null);
    if (channelSearchDebounceRef.current) window.clearTimeout(channelSearchDebounceRef.current);

    const trimmed = next.trim();
    if (!trimmed || looksLikeYoutubeLink(trimmed) || trimmed.length < 2) {
      setChannelResults([]);
      setChannelDropdownOpen(false);
      setSearchingChannels(false);
      return;
    }

    const requestId = ++channelSearchRequestIdRef.current;
    channelSearchDebounceRef.current = window.setTimeout(async () => {
      setSearchingChannels(true);
      setChannelDropdownOpen(true);
      const result = await searchYoutubeVideosAction(trimmed);
      if (requestId !== channelSearchRequestIdRef.current) return;
      setSearchingChannels(false);
      if (!result.ok) {
        setChannelResults([]);
        return;
      }
      // Video search naturally returns several videos per channel — dedupe
      // down to one entry per channel so the dropdown reads as a channel
      // picker, not a video picker.
      const seen = new Set<string>();
      const deduped: YoutubeVideoSearchResult[] = [];
      for (const r of result.data) {
        const key = r.channelTitle.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        deduped.push(r);
        if (deduped.length >= 6) break;
      }
      setChannelResults(deduped);
    }, 350);
  }

  // Picking a channel from the live-search dropdown resolves to *its
  // channel* — reuses the exact same lookup the paste-a-link flow already
  // does (which already knows how to turn a video URL into the channel that
  // posted it), just fed a URL built from the search result instead of one
  // someone pasted in.
  function pickChannelResult(result: YoutubeVideoSearchResult) {
    setChannelDropdownOpen(false);
    setYoutubeUrlInput(result.channelTitle);
    startYoutubeLookup(async () => {
      applyYoutubeLookupResult(await lookupYoutubeChannel(`https://www.youtube.com/watch?v=${result.videoId}`));
    });
  }

  async function handlePublish() {
    if (!idRef.current) return;
    setIsPublishing(true);
    setPublishError(null);
    const result = await publishArtist(idRef.current);
    setIsPublishing(false);
    if (result.ok) {
      setPublished({ repoUrl: result.repoUrl, siteUrl: result.siteUrl });
      setDeployStatus(result.deploymentId ? "queued" : "unknown");
      setDeployStartedAt(Date.now());
      setElapsedSeconds(0);
    } else {
      setPublishError(result.error);
    }
  }

  // Polls Vercel's real deployment status every few seconds while a build
  // is in flight, rather than the previous behavior of declaring success
  // the instant the repo + Vercel project existed — which is what let
  // "Published!" show even though nothing had actually built yet, and the
  // link 404'd until someone found their way into the Vercel dashboard and
  // deployed it by hand.
  useEffect(() => {
    if (deployStatus !== "queued" && deployStatus !== "building") return;
    if (!idRef.current) return;
    const artistId = idRef.current;

    const poll = setInterval(async () => {
      const result = await checkPublishStatus(artistId);
      if (result.status === "ready") {
        setDeployStatus("ready");
        if (result.siteUrl) {
          setPublished((prev) => (prev ? { ...prev, siteUrl: result.siteUrl! } : prev));
        }
      } else if (result.status === "error") {
        setDeployStatus("error");
        setPublishError(result.message);
      } else if (result.status === "building") setDeployStatus("building");
      else if (result.status === "queued") setDeployStatus("queued");
      else setDeployStatus("unknown");
    }, 4000);

    return () => clearInterval(poll);
  }, [deployStatus]);

  useEffect(() => {
    if (deployStatus !== "queued" && deployStatus !== "building") return;
    const tick = setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - deployStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [deployStatus, deployStartedAt]);

  async function handleUnpublish() {
    if (!idRef.current) return;
    if (
      !window.confirm(
        "This permanently deletes the standalone GitHub repo and Vercel project for this artist. Continue?"
      )
    ) {
      return;
    }
    setIsUnpublishing(true);
    setPublishError(null);
    const result = await unpublishArtist(idRef.current);
    setIsUnpublishing(false);
    if (result.ok) {
      setPublished(null);
      setDeployStatus("idle");
    } else {
      setPublishError(result.error);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    // Deliberately the original `artist` prop, not `!idRef.current` — the
    // debounced autosave (see saveProgress/useEffect above) sets idRef.current
    // as soon as it fires, which is typically well before anyone finishes
    // filling out the rest of the form and clicks this button. Checking
    // idRef.current here meant isNew was already false by the time of a real
    // submit in practice, silently skipping the whole eager-provisioning
    // overlay below every time. `artist` is a prop set once at mount (present
    // only on the edit page, never the new-artist page) so it can't drift
    // the way a ref mutated by autosave does.
    const isNew = !artist;
    // Opened synchronously, within the click itself, so the browser trusts
    // it as a real user-initiated tab rather than blocking it as a popup —
    // by the time creation actually finishes below, we're well past the
    // point where window.open would still count as user-triggered. Left on
    // a branded placeholder (not navigated to the real site) until
    // provisioning finishes, so it's never visibly lagging through empty
    // tabs while data is still loading.
    const newSiteTab = isNew ? window.open("about:blank", "_blank") : null;
    if (newSiteTab) {
      newSiteTab.document.write(
        `<!DOCTYPE html><html><head><title>${form.name || "Preparing"}</title><style>body{background:#0a0a0a;color:rgba(255,255,255,0.6);font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-size:14px;}</style></head><body>Preparing the dashboard…</body></html>`
      );
      newSiteTab.document.close();
    }

    startTransition(async () => {
      const result = await upsertArtist({ ...form, id: idRef.current });
      if (!result.ok) {
        setFormError(result.error);
        newSiteTab?.close();
        return;
      }
      idRef.current = result.id;
      setSavedArtistId(result.id);

      // A brand-new artist doesn't have a row to attach an audience upload
      // to until upsertArtist just created one — run that deferred step
      // now, using the id it just returned.
      if (isNew) {
        if (audienceFile) {
          const formData = new FormData();
          formData.append("file", audienceFile);
          const audienceResult = await uploadAudienceResearch(result.id, formData);
          if (!audienceResult.ok) {
            setFormError(
              `Artist created, but importing the audience file failed: ${audienceResult.error}`
            );
            newSiteTab?.close();
            return;
          }
        }

        // Rather than dropping a visitor straight onto a live site that
        // still has to lazily fetch every source (and previously required
        // a manual "Refresh Everything" click to actually fill in), a
        // brand-new artist's data gets fetched eagerly right now, with
        // visible per-step progress — see ProvisioningOverlay.tsx.
        provisioningCompleteRef.current = () => {
          if (newSiteTab) newSiteTab.location.href = `/s/${form.slug}`;
          router.push(`/builder/artists/${result.id}`);
          setProvisioning(null);
        };
        setProvisioning({
          artistId: result.id,
          slug: form.slug,
          artistName: form.name,
          youtubeChannelId: form.youtube_channel_id,
        });
        return;
      }

      router.push("/builder/artists");
    });
  }

  const saveStatusText: Record<typeof saveStatus, string> = {
    idle: artist ? "Up to date" : "Not saved yet",
    dirty: "Unsaved changes",
    saving: "Saving…",
    saved: "All changes saved",
    error: "Couldn't save",
  };
  const saveStatusColor: Record<typeof saveStatus, string> = {
    idle: "text-neutral-400 dark:text-white/40",
    dirty: "text-amber-600 dark:text-amber-400",
    saving: "text-neutral-500 dark:text-white/50",
    saved: "text-emerald-600 dark:text-emerald-400",
    error: "text-red-600 dark:text-red-400",
  };

  // Roughly "how far along is this artist" — deliberately loose thresholds
  // (nothing here blocks saving, it's just a glanceable signal) rather than
  // an exhaustive field-by-field checklist. Three checkpoints used to mean
  // typing a name/slug (nearly instant) already jumped the bar a full third
  // full, and pasting one background image jumped it to two-thirds — over
  // before the rest of the form (colours, YouTube channel, aesthetic
  // tuning, gate page) had been touched at all. More, finer-grained
  // checkpoints spread that same "quick fields go fast" reality across a
  // bar that actually tracks with how much is left rather than snapping to
  // big fractions from the first thirty seconds of typing.
  const checkpoints = [
    !!form.name.trim() && !!form.slug.trim() && form.enabled_tabs.length > 0,
    !!form.background_image_url,
    !!form.project_title.trim() && !!form.tagline.trim(),
    !!form.youtube_channel_id?.trim(),
    !!form.aesthetic_prompt?.trim() || !!form.aesthetic_params,
    !!form.gate_background_url,
  ];
  const formProgress = checkpoints.filter(Boolean).length / checkpoints.length;

  return (
    <>
    {/* Very subtle by design — a hairline, not a loud stepper — fixed to
        the true top of the viewport (above even the builder's own app
        header) so it reads as "progress through the whole page" rather
        than being scoped to wherever the form happens to scroll. */}
    <div className="fixed inset-x-0 top-0 z-[60] h-[2px] bg-transparent">
      <div
        className="h-full bg-builder-accent transition-all duration-500 ease-out"
        style={{ width: `${formProgress * 100}%`, opacity: formProgress > 0 ? 0.7 : 0 }}
      />
    </div>
    <form onSubmit={handleSubmit} className="flex w-full max-w-2xl flex-col gap-6 lg:max-w-3xl 2xl:max-w-5xl">
      {/* The builder's own app header (BuilderLayout) is separately sticky
          at top-0 with a higher z-index — offsetting this bar below it
          (rather than also sticking flush to top-0) keeps it from sitting
          flush against, or hidden behind, the very top edge of the window
          once the page scrolls. */}
      <div className="sticky top-16 z-10 flex items-center justify-between gap-3 rounded-full border border-neutral-200/70 bg-white/90 px-4 py-2.5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/80">
        <p className={`ml-1.5 text-xs font-medium ${saveStatusColor[saveStatus]}`}>{saveStatusText[saveStatus]}</p>
        {/* A running "where am I" while scrolled through a long form — the
            numbered Section titles alone only orient someone once they've
            already scrolled to one. Hidden below sm since three pills plus
            the save status and button don't all fit a narrow screen. */}
        <div className="hidden items-center gap-1 sm:flex">
          {[
            { id: "section-setup", label: "1. Setup" },
            { id: "section-media", label: "2. Media" },
            { id: "section-aesthetic", label: "3. Aesthetic" },
          ].map((step) => (
            <a
              key={step.id}
              href={`#${step.id}`}
              className="rounded-full px-2.5 py-1 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white"
            >
              {step.label}
            </a>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void saveProgress()}
          disabled={saveStatus === "saving" || !form.name.trim() || !form.slug.trim()}
          className="rounded-full border border-neutral-200 px-3.5 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-40 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/5"
        >
          Save progress
        </button>
      </div>

      <Section id="section-setup" title="1. Initial setup" description="Who this is, their YouTube channel, and which tabs their site includes.">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className={labelClass}>Artist name</span>
          <input
            required
            value={form.name}
            onChange={(e) => handleNameChange(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className={`${labelClass} flex items-center gap-1.5`}>
            Slug (site URL: /s/&lt;slug&gt;)
            <HelpTooltip>Also determines the gate password, shown below as you type it.</HelpTooltip>
          </span>
          <input
            required
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              update("slug", slugify(e.target.value));
            }}
            className={`${inputClass} font-mono`}
          />
          {form.slug && (
            <p className="text-xs text-neutral-500 dark:text-white/40">
              Password page password: <span className="font-mono text-neutral-700 dark:text-white/70">{computeArtistPassword(form.slug)}</span>
            </p>
          )}
        </label>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className={labelClass}>YouTube channel</span>
          <div className="relative flex gap-2">
            <input
              value={youtubeUrlInput}
              onChange={(e) => handleChannelQueryChange(e.target.value)}
              onFocus={() => {
                if (channelResults.length > 0) setChannelDropdownOpen(true);
              }}
              onBlur={() => window.setTimeout(() => setChannelDropdownOpen(false), 150)}
              placeholder="Type their name, or paste a channel/video link"
              className={`flex-1 ${inputClass}`}
            />
            <button
              type="button"
              disabled={isLookingUpYoutube || !youtubeUrlInput.trim()}
              onClick={() => {
                setChannelDropdownOpen(false);
                startYoutubeLookup(async () => {
                  applyYoutubeLookupResult(await lookupYoutubeChannel(youtubeUrlInput));
                });
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
            >
              <YoutubeIcon className="h-4 w-4 shrink-0" />
              {isLookingUpYoutube ? "Looking up…" : "Find channel"}
            </button>

            {channelDropdownOpen && (searchingChannels || channelResults.length > 0) && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-neutral-900">
                {searchingChannels && channelResults.length === 0 && (
                  <p className="px-3 py-2 text-xs text-neutral-400 dark:text-white/40">Searching…</p>
                )}
                {channelResults.map((r) => (
                  <button
                    key={r.videoId}
                    type="button"
                    onClick={() => pickChannelResult(r)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-white/5"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.thumbnail} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                    <span className="truncate text-sm text-neutral-800 dark:text-white/80">{r.channelTitle}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {youtubeLookup?.status === "success" && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              ✓ Found: {youtubeLookup.channelTitle || form.youtube_channel_id}
            </p>
          )}
          {suggestedAccent && (
            <button
              type="button"
              onClick={() => {
                update("accent_color", suggestedAccent);
                setSuggestedAccent(null);
              }}
              className="flex w-fit items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
            >
              <span
                className="h-6 w-6 shrink-0 rounded-full border border-black/10 shadow-sm dark:border-white/20"
                style={{ backgroundColor: suggestedAccent }}
              />
              Use their channel&apos;s most prominent colour ({suggestedAccent}) as your accent colour?
            </button>
          )}
          {youtubeLookup?.status === "error" && (
            <p className="text-xs text-red-600 dark:text-red-400">{youtubeLookup.error}</p>
          )}
          {!youtubeLookup && form.youtube_channel_id && (
            <p className="text-xs text-neutral-500 dark:text-white/40">
              Currently linked: {form.youtube_channel_id}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          {/* Collapsed by default — everything defaults to enabled, so this
              is only worth scanning once there's something to compare it
              against, not the first decision a blank form asks for. */}
          <button
            type="button"
            onClick={() => setTabsChecklistOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-1.5 text-left"
          >
            <span className={`${labelClass} flex items-center gap-1.5`}>
              Which dashboard tabs to include
              <HelpTooltip>All included by default — only worth changing if some genuinely don&apos;t apply.</HelpTooltip>
            </span>
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-200 dark:text-white/40 ${
                tabsChecklistOpen ? "rotate-180" : ""
              }`}
              aria-hidden
            >
              <path d="m5.5 7.5 4.5 5 4.5-5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {tabsChecklistOpen && (
            <TabsChecklist value={form.enabled_tabs} onChange={(tabs) => update("enabled_tabs", tabs)} />
          )}
        </div>
      </Section>

      <Section
        id="section-media"
        title="2. Media"
        description="Backgrounds for the dashboard and the password page — upload a file, search the web, or paste one straight in."
      >
        {form.slug ? (
          <>
            <BackgroundMediaField
              label="Background"
              slotName="background"
              artistSlug={form.slug}
              value={form.background_image_url}
              onChange={(v) => update("background_image_url", v)}
            />
            <p className="-mt-2 text-xs text-neutral-500 dark:text-white/40">
              Shown behind every page of the dashboard (not the password page, set separately below).
            </p>

            <BackgroundMediaField
              label="Password page background"
              slotName="gate-background"
              artistSlug={form.slug}
              value={form.gate_background_url}
              onChange={(v) => update("gate_background_url", v)}
            />

            <div className="flex flex-col gap-1.5">
              <span className={`${labelClass} flex items-center gap-1.5`}>
                Password page preview
                <HelpTooltip>
                  Live — every control below (position, zoom, darkness, grain) updates it instantly.
                  Drag directly on it to reposition the background. Accent colour is the thin divider
                  line under the title.
                </HelpTooltip>
              </span>
              <div
                onPointerDown={handleGatePointerDown}
                onPointerMove={handleGatePointerMove}
                onPointerUp={handleGatePointerUp}
                className={`relative flex h-40 touch-none select-none flex-col items-center justify-center gap-2 overflow-hidden rounded-lg px-4 text-center text-white lg:h-52 2xl:h-64 ${
                  form.gate_background_url ? (gateDragging ? "cursor-grabbing" : "cursor-grab") : ""
                }`}
                style={{ backgroundColor: "#0a0a0a", fontFamily: `"${form.font_family}", sans-serif` }}
              >
                {form.gate_background_url &&
                  (isGateVideoUrl(form.gate_background_url) ? (
                    <video
                      src={form.gate_background_url}
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{
                        objectPosition: `${gateTheme.gate_bg_position_x}% ${gateTheme.gate_bg_position_y}%`,
                        transform: `scale(${gateTheme.gate_bg_zoom})`,
                      }}
                      muted
                      loop
                      autoPlay
                      playsInline
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.gate_background_url}
                      alt=""
                      draggable={false}
                      className="absolute inset-0 h-full w-full select-none object-cover"
                      style={{
                        objectPosition: `${gateTheme.gate_bg_position_x}% ${gateTheme.gate_bg_position_y}%`,
                        transform: `scale(${gateTheme.gate_bg_zoom})`,
                      }}
                    />
                  ))}
                {form.gate_background_url && (
                  <div
                    className="absolute inset-0"
                    style={{ backgroundColor: `rgba(0,0,0,${form.gate_scrim_opacity})` }}
                  />
                )}
                {form.gate_grain_intensity > 0 && (
                  <div
                    className="animate-grain absolute inset-0 mix-blend-overlay"
                    style={{
                      opacity: form.gate_grain_intensity,
                      backgroundImage: grainTexture(form.gate_grain_monochrome),
                      backgroundSize: "90px 90px",
                    }}
                  />
                )}
                <p className="relative z-10 text-[10px] font-semibold uppercase tracking-[0.35em] text-white/70">
                  {form.tagline || "Tagline"}
                </p>
                <p className="relative z-10 text-xl font-bold uppercase leading-none tracking-tight">
                  {form.project_title || "Project title"}
                </p>
                <div className="relative z-10 mt-1 h-px w-16" style={{ backgroundColor: form.accent_color }} />
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-3 dark:border-white/10">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="flex justify-between">
                    <span>Zoom / resize</span>
                    <span className="font-mono text-xs text-neutral-500 dark:text-white/40">
                      {gateTheme.gate_bg_zoom.toFixed(2)}x
                    </span>
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={2.5}
                    step={0.05}
                    value={gateTheme.gate_bg_zoom}
                    onChange={(e) => setGateTheme({ gate_bg_zoom: Number(e.target.value) })}
                    className="accent-builder-accent"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="flex justify-between">
                    <span>Darkness overlay</span>
                    <span className="font-mono text-xs text-neutral-500 dark:text-white/40">
                      {form.gate_scrim_opacity}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={0.85}
                    step={0.05}
                    value={form.gate_scrim_opacity}
                    onChange={(e) => update("gate_scrim_opacity", Number(e.target.value))}
                    className="accent-builder-accent"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="flex justify-between">
                    <span>Grain intensity</span>
                    <span className="font-mono text-xs text-neutral-500 dark:text-white/40">
                      {form.gate_grain_intensity}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={form.gate_grain_intensity}
                    onChange={(e) => update("gate_grain_intensity", Number(e.target.value))}
                    className="accent-builder-accent"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.gate_grain_monochrome}
                    onChange={(e) => update("gate_grain_monochrome", e.target.checked)}
                    className="h-4 w-4 rounded border-neutral-300 accent-builder-accent dark:border-white/20"
                  />
                  Monochrome grain
                </label>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-neutral-500 dark:text-white/40">
            Enter a name/slug to enable media uploads.
          </p>
        )}
      </Section>

      <Section
        id="section-aesthetic"
        title="3. Aesthetic"
        description="Look and feel — colours, font, title text, and fine-tuning on top of it all (background pan/zoom/contrast, title weight, card shape, plus readability and effects)."
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className={`${labelClass} flex items-center gap-1.5`}>
            Project title
            <HelpTooltip>
              The big title shown top-left on the site (e.g. &quot;The Recording Studio&quot;). The
              artist&apos;s name is shown separately, top-right.
            </HelpTooltip>
          </span>
          <input
            value={form.project_title}
            onChange={(e) => update("project_title", e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className={labelClass}>Tagline</span>
          <input
            value={form.tagline}
            onChange={(e) => update("tagline", e.target.value)}
            className={inputClass}
          />
        </label>

        <div className="flex gap-6">
          <ColorField label="Primary" value={form.primary_color} onChange={(v) => update("primary_color", v)} />
          <ColorField label="Accent" value={form.accent_color} onChange={(v) => update("accent_color", v)} />
        </div>
        <FontPicker value={form.font_family} onChange={(v) => update("font_family", v)} />

        <div className="border-t border-neutral-200 pt-4 dark:border-white/10">
          <p className={labelClass}>Fine-tuning</p>
        </div>
        <ThemeEditor
          value={form.theme_overrides}
          onChange={(theme_overrides) => update("theme_overrides", theme_overrides)}
          primaryColor={form.primary_color}
          accentColor={form.accent_color}
          fontFamily={form.font_family}
          backgroundImageUrl={form.background_image_url}
          projectTitle={form.project_title}
          tagline={form.tagline}
          artistName={form.name}
          aestheticParams={form.aesthetic_params}
          onAestheticParamsChange={(aesthetic_params) => update("aesthetic_params", aesthetic_params)}
        />
        <div className="border-t border-neutral-200 pt-4 dark:border-white/10">
          {/* Collapsed by default (unless there's already something written
              in it) — this is a rarely-needed escape hatch for whatever the
              sliders above can't already do, not something that needs to
              stay visible alongside them on every visit. */}
          <button
            type="button"
            onClick={() => setEdgeCasesOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-1.5 text-left"
          >
            <span className={`${labelClass} flex items-center gap-1.5`}>
              Edge cases
              <HelpTooltip>
                Effects above already cover grain/tint/blur/vignette/aberration — only use this box
                for something those sliders can&apos;t do. Parsed into the same effects on save.
              </HelpTooltip>
            </span>
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-200 dark:text-white/40 ${
                edgeCasesOpen ? "rotate-180" : ""
              }`}
              aria-hidden
            >
              <path d="m5.5 7.5 4.5 5 4.5-5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {edgeCasesOpen && (
            <textarea
              rows={3}
              placeholder='e.g. "warm orange tint that pulses slightly"'
              value={form.aesthetic_prompt}
              onChange={(e) => update("aesthetic_prompt", e.target.value)}
              className={`mt-2 w-full ${inputClass}`}
            />
          )}
        </div>
      </Section>

      <Section title="Audience research">
        <AudienceUploadField artistId={savedArtistId ?? null} onFileSelected={setAudienceFile} />
      </Section>

      {formError && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-full bg-builder-accent px-6 py-2.5 text-sm font-semibold text-black shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md hover:brightness-95 disabled:opacity-50"
      >
        {isPending ? "Saving..." : artist ? "Save changes" : "Create artist"}
      </button>

      {artist && (
        <Section
          title="Publish standalone site"
          description="Creates a real, independent GitHub repo and Vercel deployment just for this artist — it stays live on its own, still reading from the same data. This can only be done once per artist."
        >
          {published ? (
            <div className="flex flex-col gap-1 text-sm">
              <div className="flex items-center gap-2">
                <BrandLogoAnimation className="h-8 w-8 dark:invert" loop={deployStatus === "queued" || deployStatus === "building"} />
                <p
                  className={
                    deployStatus === "ready"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : deployStatus === "error"
                        ? "text-red-600 dark:text-red-400"
                        : "text-neutral-600 dark:text-white/70"
                  }
                >
                  {deployStatus === "ready"
                    ? "Live."
                    : deployStatus === "queued"
                      ? "Queued to deploy..."
                      : deployStatus === "building"
                        ? "Building..."
                        : deployStatus === "error"
                          ? "Build failed."
                          : "Published — repo and Vercel project created."}
                </p>
              </div>

              {(deployStatus === "queued" || deployStatus === "building") && (
                <div className="my-1 flex flex-col gap-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-builder-accent transition-all duration-700 ease-out"
                      style={{ width: `${Math.min(92, (elapsedSeconds / 90) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-white/40">
                    {elapsedSeconds}s elapsed — usually takes 1-2 minutes. This page checks automatically;
                    no need to refresh or go to Vercel yourself.
                  </p>
                </div>
              )}

              {deployStatus === "unknown" && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Couldn&apos;t confirm the build status automatically — open the Vercel dashboard for
                  this project to check.
                </p>
              )}

              <a
                href={published.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-amber-700 underline dark:text-amber-400"
              >
                {published.repoUrl}
              </a>
              <a
                href={published.siteUrl}
                target="_blank"
                rel="noreferrer"
                className="text-amber-700 underline dark:text-amber-400"
              >
                {published.siteUrl}
              </a>
              <button
                type="button"
                disabled={isUnpublishing}
                onClick={handleUnpublish}
                className="mt-2 self-start rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                {isUnpublishing ? "Deleting..." : "Delete standalone site"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={isPublishing}
              onClick={handlePublish}
              className="self-start rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/5"
            >
              {isPublishing ? "Publishing..." : "Publish to GitHub + Vercel"}
            </button>
          )}

          {publishError && (
            <p className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              {publishError}
            </p>
          )}
        </Section>
      )}
    </form>
    {provisioning && (
      <ProvisioningOverlay
        artistId={provisioning.artistId}
        slug={provisioning.slug}
        artistName={provisioning.artistName}
        youtubeChannelId={provisioning.youtubeChannelId}
        onComplete={() => provisioningCompleteRef.current()}
      />
    )}
    </>
  );
}
