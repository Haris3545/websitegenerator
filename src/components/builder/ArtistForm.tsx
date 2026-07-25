"use client";

import { useState, useTransition } from "react";
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

  function update<K extends keyof ArtistFormInput>(key: K, value: ArtistFormInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleNameChange(name: string) {
    update("name", name);
    if (!slugTouched) update("slug", slugify(name));
  }

  async function handlePublish() {
    if (!artist) return;
    setIsPublishing(true);
    setPublishError(null);
    const result = await publishArtist(artist.id);
    setIsPublishing(false);
    if (result.ok) {
      setPublished({ repoUrl: result.repoUrl, siteUrl: result.siteUrl });
    } else {
      setPublishError(result.error);
    }
  }

  async function handleUnpublish() {
    if (!artist) return;
    if (
      !window.confirm(
        "This permanently deletes the standalone GitHub repo and Vercel project for this artist. Continue?"
      )
    ) {
      return;
    }
    setIsUnpublishing(true);
    setPublishError(null);
    const result = await unpublishArtist(artist.id);
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
    const isNew = !artist;
    // Opened synchronously, within the click itself, so the browser trusts
    // it as a real user-initiated tab rather than blocking it as a popup —
    // by the time creation actually finishes below, we're well past the
    // point where window.open would still count as user-triggered.
    const newSiteTab = isNew ? window.open("about:blank", "_blank") : null;

    startTransition(async () => {
      const result = await upsertArtist(form);
      if (!result.ok) {
        setFormError(result.error);
        newSiteTab?.close();
        return;
      }

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

  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-6">
      <label className="flex flex-col gap-1 text-sm">
        Artist name
        <input
          required
          value={form.name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Slug (site URL: /s/&lt;slug&gt;)
        <input
          required
          value={form.slug}
          onChange={(e) => {
            setSlugTouched(true);
            update("slug", slugify(e.target.value));
          }}
          className="rounded border border-neutral-300 px-3 py-2 font-mono"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Project title
        <input
          value={form.project_title}
          onChange={(e) => update("project_title", e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2"
        />
        <span className="text-xs text-neutral-900">
          The big title shown top-left on the site (e.g. &quot;The Recording Studio&quot;). The
          artist&apos;s name is shown separately, top-right.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Tagline
        <input
          value={form.tagline}
          onChange={(e) => update("tagline", e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>

      <div className="flex flex-col gap-1 text-sm">
        <span>YouTube channel</span>
        <div className="flex gap-2">
          <input
            value={youtubeUrlInput}
            onChange={(e) => {
              setYoutubeUrlInput(e.target.value);
              setYoutubeLookup(null);
            }}
            placeholder="Paste the channel's URL, or a link to one of their videos"
            className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm"
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
            className="rounded border border-neutral-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {isLookingUpYoutube ? "Looking up..." : "Find channel"}
          </button>
        </div>
        {youtubeLookup?.status === "success" && (
          <p className="text-xs text-green-700">
            ✓ Found: {youtubeLookup.channelTitle || form.youtube_channel_id}
          </p>
        )}
        {youtubeLookup?.status === "error" && (
          <p className="text-xs text-red-600">{youtubeLookup.error}</p>
        )}
        {!youtubeLookup && form.youtube_channel_id && (
          <p className="text-xs text-neutral-900">Currently linked: {form.youtube_channel_id}</p>
        )}
        <span className="text-xs text-neutral-900">
          Powers the YouTube tab — no need to hunt for a channel ID, just paste any link from the
          channel.
        </span>
      </div>

      <div className="flex gap-6">
        <ColorField
          label="Primary"
          value={form.primary_color}
          onChange={(v) => update("primary_color", v)}
        />
        <ColorField
          label="Secondary"
          value={form.secondary_color}
          onChange={(v) => update("secondary_color", v)}
        />
        <ColorField
          label="Accent"
          value={form.accent_color}
          onChange={(v) => update("accent_color", v)}
        />
      </div>

      <FontPicker value={form.font_family} onChange={(v) => update("font_family", v)} />

      {form.slug ? (
        <>
          <MediaUploadField
            label="Background"
            slotName="background"
            artistSlug={form.slug}
            value={form.background_image_url}
            onChange={(v) => update("background_image_url", v)}
          />
          <p className="-mt-4 text-xs text-neutral-900">
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
        <p className="text-sm text-neutral-900">Enter a name/slug to enable media uploads.</p>
      )}

      <label className="flex flex-col gap-1 text-sm">
        Aesthetic tailoring
        <textarea
          rows={3}
          placeholder='e.g. "film grain overlay, 30%, slight vignette"'
          value={form.aesthetic_prompt}
          onChange={(e) => update("aesthetic_prompt", e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2"
        />
        <span className="text-xs text-neutral-900">
          Describe grain, tint, blur, or vignette adjustments in your own words — parsed into CSS
          on save.
        </span>
      </label>

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

      <TabsChecklist
        value={form.enabled_tabs}
        onChange={(tabs) => update("enabled_tabs", tabs)}
      />

      <div className="rounded border border-neutral-200 p-4">
        <h2 className="mb-1 text-sm font-semibold">Audience research</h2>
        <AudienceUploadField
          artistId={artist?.id ?? null}
          onFileSelected={setAudienceFile}
        />
      </div>

      {formError && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? "Saving..." : artist ? "Save changes" : "Create artist"}
      </button>

      {artist && (
        <div className="rounded border border-neutral-200 p-4">
          <h2 className="mb-1 text-sm font-semibold">Publish standalone site</h2>
          <p className="mb-3 text-xs text-neutral-900">
            Creates a real, independent GitHub repo and Vercel deployment just for this artist —
            it stays live on its own, still reading from the same data. This can only be done
            once per artist.
          </p>

          {published ? (
            <div className="flex flex-col gap-1 text-sm">
              <p className="text-green-700">Published.</p>
              <a
                href={published.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-neutral-900 underline"
              >
                {published.repoUrl}
              </a>
              <a
                href={published.siteUrl}
                target="_blank"
                rel="noreferrer"
                className="text-neutral-900 underline"
              >
                {published.siteUrl}
              </a>
              <p className="mt-1 text-xs text-neutral-900">
                The Vercel deployment can take a minute or two to finish building the first time.
              </p>
              <button
                type="button"
                disabled={isUnpublishing}
                onClick={handleUnpublish}
                className="mt-2 self-start rounded border border-red-300 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
              >
                {isUnpublishing ? "Deleting..." : "Delete standalone site"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={isPublishing}
              onClick={handlePublish}
              className="self-start rounded border border-neutral-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {isPublishing ? "Publishing..." : "Publish to GitHub + Vercel"}
            </button>
          )}

          {publishError && (
            <p className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
              {publishError}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
