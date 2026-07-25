"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ColorField } from "@/components/builder/ColorField";
import { FontPicker } from "@/components/builder/FontPicker";
import { MediaUploadField } from "@/components/builder/MediaUploadField";
import { AudienceUploadField } from "@/components/builder/AudienceUploadField";
import { TabsChecklist } from "@/components/builder/TabsChecklist";
import { ThemeEditor } from "@/components/builder/ThemeEditor";
import {
  upsertArtist,
  uploadAudienceResearch,
  lookupYoutubeChannel,
  publishArtist,
  unpublishArtist,
  type ArtistFormInput,
} from "@/app/builder/actions";
import type { Artist } from "@/lib/database.types";
import { DEFAULT_THEME_OVERRIDES } from "@/lib/theme";

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
  const [formError, setFormError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [published, setPublished] = useState<{ repoUrl: string; siteUrl: string } | null>(
    artist?.published_repo_url && artist?.published_site_url
      ? { repoUrl: artist.published_repo_url, siteUrl: artist.published_site_url }
      : null
  );

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

  async function handlePublish() {
    if (!idRef.current) return;
    setIsPublishing(true);
    setPublishError(null);
    const result = await publishArtist(idRef.current);
    setIsPublishing(false);
    if (result.ok) {
      setPublished({ repoUrl: result.repoUrl, siteUrl: result.siteUrl });
    } else {
      setPublishError(result.error);
    }
  }

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
    // point where window.open would still count as user-triggered.
    const newSiteTab = isNew ? window.open("about:blank", "_blank") : null;

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
            return;
          }
        }
      }

      if (newSiteTab) newSiteTab.location.href = `/s/${form.slug}`;
      router.push(isNew ? `/builder/artists/${result.id}` : "/builder/artists");
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

      <Section title="Basics">
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
        </label>

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
      </Section>

      <Section title="YouTube channel" description="Powers the YouTube tab.">
        <div className="flex gap-2">
          <input
            value={youtubeUrlInput}
            onChange={(e) => {
              setYoutubeUrlInput(e.target.value);
              setYoutubeLookup(null);
            }}
            placeholder="Paste the channel's URL, or a link to one of their videos"
            className={`flex-1 text-sm ${inputClass}`}
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
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/5"
          >
            {isLookingUpYoutube ? "Looking up..." : "Find channel"}
          </button>
        </div>
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
      </Section>

      <Section title="Branding">
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
      </Section>

      <Section title="Media">
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
            <MediaUploadField
              label="Password page background"
              slotName="gate-background"
              artistSlug={form.slug}
              value={form.gate_background_url}
              onChange={(v) => update("gate_background_url", v)}
            />
          </>
        ) : (
          <p className="text-sm text-neutral-500 dark:text-white/40">
            Enter a name/slug to enable media uploads.
          </p>
        )}
      </Section>

      <Section
        title="Aesthetic tailoring"
        description='Describe grain, tint, blur, or vignette adjustments in your own words — parsed into CSS on save.'
      >
        <textarea
          rows={3}
          placeholder='e.g. "film grain overlay, 30%, slight vignette"'
          value={form.aesthetic_prompt}
          onChange={(e) => update("aesthetic_prompt", e.target.value)}
          className={inputClass}
        />
      </Section>

      <Section title="Fine-tuned theme">
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
      </Section>

      <Section title="Tabs">
        <TabsChecklist value={form.enabled_tabs} onChange={(tabs) => update("enabled_tabs", tabs)} />
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
              <p className="text-emerald-600 dark:text-emerald-400">Published.</p>
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
              <p className="mt-1 text-xs text-neutral-500 dark:text-white/40">
                The Vercel deployment can take a minute or two to finish building the first time.
              </p>
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
  );
}
