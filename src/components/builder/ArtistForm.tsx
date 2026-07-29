"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ColorField } from "@/components/builder/ColorField";
import { FontPicker } from "@/components/builder/FontPicker";
import { MediaUploadField } from "@/components/builder/MediaUploadField";
import { YoutubeClipField } from "@/components/builder/YoutubeClipField";
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
import { DEFAULT_THEME_OVERRIDES } from "@/lib/theme";
import { BrandLogoAnimation } from "@/components/BrandLogoAnimation";
import { ProvisioningOverlay } from "@/components/builder/ProvisioningOverlay";
import { YoutubeSearchModal } from "@/components/builder/YoutubeSearchModal";
import { SEARCH_BUTTON_CLASS } from "@/components/builder/mediaActionStyles";
import type { YoutubeVideoSearchResult } from "@/lib/youtube";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const inputClass =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder-neutral-400 focus:border-builder-accent focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder-white/30";
const labelClass = "text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-white/50";
const sectionClass =
  "flex flex-col gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-5 dark:border-white/10 dark:bg-white/[0.03]";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={sectionClass}>
      <div>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-white/40">{description}</p>
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
    secondary_color: artist?.secondary_color ?? "#0f172a",
    accent_color: artist?.accent_color ?? "#eab308",
    font_family: artist?.font_family ?? "Inter",
    background_image_url: artist?.background_image_url ?? null,
    gate_background_url: artist?.gate_background_url ?? null,
    background_youtube_id: artist?.background_youtube_id ?? null,
    background_youtube_start: artist?.background_youtube_start ?? 0,
    background_youtube_end: artist?.background_youtube_end ?? null,
    gate_youtube_id: artist?.gate_youtube_id ?? null,
    gate_youtube_start: artist?.gate_youtube_start ?? 0,
    gate_youtube_end: artist?.gate_youtube_end ?? null,
    gate_scrim_opacity: artist?.gate_scrim_opacity ?? 0.55,
    gate_grain_intensity: artist?.gate_grain_intensity ?? 0,
    gate_grain_monochrome: artist?.gate_grain_monochrome ?? false,
    youtube_channel_id: artist?.youtube_channel_id ?? null,
    aesthetic_prompt: artist?.aesthetic_prompt ?? "",
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
  const [channelSearching, setChannelSearching] = useState(false);
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

  function handleNameChange(name: string) {
    update("name", name);
    if (!slugTouched) update("slug", slugify(name));
  }

  // Picking a video from the search modal resolves to *its channel* — reuses
  // the exact same lookup the paste-a-link flow already does (which already
  // knows how to turn a video URL into the channel that posted it), just fed
  // a URL built from the search result instead of one someone pasted in.
  function handleChannelVideoPicked(result: YoutubeVideoSearchResult) {
    setChannelSearching(false);
    startYoutubeLookup(async () => {
      const lookupResult = await lookupYoutubeChannel(`https://www.youtube.com/watch?v=${result.videoId}`);
      if (lookupResult.ok) {
        update("youtube_channel_id", lookupResult.channelId);
        setYoutubeLookup({ status: "success", channelTitle: lookupResult.channelTitle });
      } else {
        setYoutubeLookup({ status: "error", error: lookupResult.error });
      }
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
    const isNew = !idRef.current;
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

  return (
    <>
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
        <p className={`text-xs font-medium ${saveStatusColor[saveStatus]}`}>{saveStatusText[saveStatus]}</p>
        <button
          type="button"
          onClick={() => void saveProgress()}
          disabled={saveStatus === "saving" || !form.name.trim() || !form.slug.trim()}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/5"
        >
          Save progress
        </button>
      </div>

      <Section title="1. Initial setup" description="Who this is, their YouTube channel, and which tabs their site includes.">
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
          <span className={labelClass}>Slug (site URL: /s/&lt;slug&gt;)</span>
          <input
            required
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              update("slug", slugify(e.target.value));
            }}
            className={`${inputClass} font-mono`}
          />
          <span className="text-xs text-neutral-500 dark:text-white/40">
            Also determines the gate password — see below.
          </span>
        </label>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className={labelClass}>YouTube channel</span>
          <div className="flex gap-2 rounded-lg border-2 border-dashed border-emerald-500/40 bg-emerald-500/[0.04] p-2 dark:border-emerald-400/30 dark:bg-emerald-400/[0.04]">
            <input
              value={youtubeUrlInput}
              onChange={(e) => {
                setYoutubeUrlInput(e.target.value);
                setYoutubeLookup(null);
              }}
              placeholder="Paste the channel's URL, or a link to one of their videos"
              className={`flex-1 text-sm rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder-neutral-400 focus:border-emerald-500 focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder-white/30`}
            />
            <button
              type="button"
              disabled={isLookingUpYoutube || !youtubeUrlInput.trim()}
              onClick={() =>
                startYoutubeLookup(async () => {
                  const result = await lookupYoutubeChannel(youtubeUrlInput);
                  if (result.ok) {
                    update("youtube_channel_id", result.channelId);
                    setYoutubeLookup({ status: "success", channelTitle: result.channelTitle });
                  } else {
                    setYoutubeLookup({ status: "error", error: result.error });
                  }
                })
              }
              className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              {isLookingUpYoutube ? "Looking up…" : "Use link"}
            </button>
          </div>
          <button
            type="button"
            disabled={isLookingUpYoutube}
            onClick={() => setChannelSearching(true)}
            className={`self-start ${SEARCH_BUTTON_CLASS}`}
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
              <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth={1.6} />
              <path d="m16 16-3.4-3.4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
            </svg>
            Search YouTube
          </button>
          {youtubeLookup?.status === "success" && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              ✓ Found: {youtubeLookup.channelTitle || form.youtube_channel_id}
            </p>
          )}
          {youtubeLookup?.status === "error" && (
            <p className="text-xs text-red-600 dark:text-red-400">{youtubeLookup.error}</p>
          )}
          {!youtubeLookup && form.youtube_channel_id && (
            <p className="text-xs text-neutral-500 dark:text-white/40">
              Currently linked: {form.youtube_channel_id}
            </p>
          )}
          {channelSearching && (
            <YoutubeSearchModal onSelect={handleChannelVideoPicked} onClose={() => setChannelSearching(false)} />
          )}
        </div>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className={labelClass}>Tabs</span>
          <TabsChecklist value={form.enabled_tabs} onChange={(tabs) => update("enabled_tabs", tabs)} />
        </div>
      </Section>

      <Section
        title="2. Media"
        description="Backgrounds for the dashboard and the password page — upload a file, search the web, or paste one straight in."
      >
        {form.slug ? (
          <>
            <MediaUploadField
              label="Background"
              slotName="background"
              artistSlug={form.slug}
              value={form.background_image_url}
              onChange={(v) => update("background_image_url", v)}
            />
            <p className="-mt-2 text-xs text-neutral-500 dark:text-white/40">
              Shown behind every page of the dashboard (not the password page — that&apos;s set
              separately below). An image or a looping muted video, either works.
            </p>
            <YoutubeClipField
              label="Or use a YouTube clip instead"
              videoId={form.background_youtube_id}
              start={form.background_youtube_start}
              end={form.background_youtube_end}
              onChange={(videoId, start, end) => {
                update("background_youtube_id", videoId);
                update("background_youtube_start", start);
                update("background_youtube_end", end);
              }}
            />
            {form.background_youtube_id && (
              <p className="-mt-2 text-xs text-neutral-500 dark:text-white/40">
                A YouTube clip takes priority over the uploaded file above while it&apos;s set — remove
                it to fall back to that upload again.
              </p>
            )}

            <MediaUploadField
              label="Password page background"
              slotName="gate-background"
              artistSlug={form.slug}
              value={form.gate_background_url}
              onChange={(v) => update("gate_background_url", v)}
            />
            <YoutubeClipField
              label="Or use a YouTube clip instead"
              videoId={form.gate_youtube_id}
              start={form.gate_youtube_start}
              end={form.gate_youtube_end}
              onChange={(videoId, start, end) => {
                update("gate_youtube_id", videoId);
                update("gate_youtube_start", start);
                update("gate_youtube_end", end);
              }}
            />
            {form.gate_youtube_id && (
              <p className="-mt-2 text-xs text-neutral-500 dark:text-white/40">
                A YouTube clip takes priority over the uploaded file above while it&apos;s set.
              </p>
            )}

            <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-3 dark:border-white/10">
              <span className={labelClass}>Password page darkness &amp; grain</span>
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
          </>
        ) : (
          <p className="text-sm text-neutral-500 dark:text-white/40">
            Enter a name/slug to enable media uploads.
          </p>
        )}
      </Section>

      <Section
        title="3. Aesthetic"
        description="Look and feel — colours, font, title text, and fine-tuning on top of it all (background pan/zoom/contrast, title weight, card shape, plus a dedicated Readability button)."
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className={labelClass}>Project title</span>
          <input
            value={form.project_title}
            onChange={(e) => update("project_title", e.target.value)}
            className={inputClass}
          />
          <span className="text-xs text-neutral-500 dark:text-white/40">
            The big title shown top-left on the site (e.g. &quot;The Recording Studio&quot;). The
            artist&apos;s name is shown separately, top-right.
          </span>
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
          <ColorField
            label="Secondary"
            value={form.secondary_color}
            onChange={(v) => update("secondary_color", v)}
          />
          <ColorField label="Accent" value={form.accent_color} onChange={(v) => update("accent_color", v)} />
        </div>
        <FontPicker value={form.font_family} onChange={(v) => update("font_family", v)} />

        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Password page preview</span>
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-lg px-4 py-8 text-center text-white"
            style={{ backgroundColor: form.secondary_color, fontFamily: `"${form.font_family}", sans-serif` }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/70">
              {form.tagline || "Tagline"}
            </p>
            <p className="text-xl font-bold uppercase leading-none tracking-tight">
              {form.project_title || "Project title"}
            </p>
            <div className="mt-1 h-px w-16" style={{ backgroundColor: form.accent_color }} />
          </div>
          <span className="text-xs text-neutral-500 dark:text-white/40">
            The secondary colour fills the whole password page background; the accent colour is the
            thin divider line under the title.
          </span>
        </div>

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
        />
        <div className="border-t border-neutral-200 pt-4 dark:border-white/10">
          <p className={labelClass}>Edge cases</p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-white/40">
            Grain, tint, blur, vignette, and chromatic aberration all have sliders on the live site
            itself (Edit mode &gt; 🎨). Only use this box for something those sliders can&apos;t do —
            it&apos;s parsed into the same effects on save.
          </p>
          <textarea
            rows={3}
            placeholder='e.g. "warm orange tint that pulses slightly"'
            value={form.aesthetic_prompt}
            onChange={(e) => update("aesthetic_prompt", e.target.value)}
            className={`mt-2 w-full ${inputClass}`}
          />
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
        className="self-start rounded-lg bg-builder-accent px-4 py-2 text-sm font-semibold text-black transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:brightness-95 disabled:opacity-50"
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
