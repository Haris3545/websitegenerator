"use client";

import { useState, useTransition } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import { ColorField } from "@/components/builder/ColorField";
import { FontPicker } from "@/components/builder/FontPicker";
import { MediaUploadField } from "@/components/builder/MediaUploadField";
import { TabsChecklist } from "@/components/builder/TabsChecklist";
import { ThemeEditor } from "@/components/builder/ThemeEditor";
import { upsertArtist, saveArtistSecrets, type ArtistFormInput } from "@/app/builder/actions";
import type { Artist } from "@/lib/database.types";
import { DEFAULT_THEME_OVERRIDES } from "@/lib/theme";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const SECRET_FIELDS = [
  { key: "youtube_api_key", label: "YouTube Data API key" },
  { key: "reddit_client_id", label: "Reddit client ID" },
  { key: "reddit_client_secret", label: "Reddit client secret" },
  { key: "lastfm_api_key", label: "Last.fm API key" },
] as const;

export function ArtistForm({
  artist,
  savedSecretKeys = [],
}: {
  artist?: Artist;
  savedSecretKeys?: string[];
}) {
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
    landing_video_url: artist?.landing_video_url ?? null,
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
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [secretsSaved, setSecretsSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function update<K extends keyof ArtistFormInput>(key: K, value: ArtistFormInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleNameChange(name: string) {
    update("name", name);
    if (!slugTouched) update("slug", slugify(name));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      try {
        await upsertArtist(form);
      } catch (err) {
        // upsertArtist redirects on success, which Next.js implements by
        // throwing a special internal error that must keep propagating —
        // unstable_rethrow lets that through untouched and only stops here
        // for a genuine failure (e.g. a Supabase/RLS error).
        unstable_rethrow(err);
        setFormError(err instanceof Error ? err.message : "Something went wrong saving this artist.");
      }
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
            label="Background image"
            kind="image"
            artistSlug={form.slug}
            value={form.background_image_url}
            onChange={(v) => update("background_image_url", v)}
          />
          <MediaUploadField
            label="Landing video"
            kind="video"
            artistSlug={form.slug}
            value={form.landing_video_url}
            onChange={(v) => update("landing_video_url", v)}
          />
          <p className="-mt-4 text-xs text-neutral-900">
            The site&apos;s background uses the video, looping and muted, whenever one is set —
            the image is only the fallback when there&apos;s no video.
          </p>
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
          <h2 className="mb-1 text-sm font-semibold">Data source API keys</h2>
          <p className="mb-3 text-xs text-neutral-900">
            Stored encrypted. Leave a field blank to keep its current value unchanged.
          </p>
          <div className="flex flex-col gap-3">
            {SECRET_FIELDS.map((field) => {
              const isSet = savedSecretKeys.includes(field.key);
              return (
                <label key={field.key} className="flex flex-col gap-1 text-sm">
                  <span>
                    {field.label}{" "}
                    <span className={isSet ? "text-green-700" : "text-neutral-500"}>
                      ({isSet ? "currently set" : "not set"})
                    </span>
                  </span>
                  <input
                    type="password"
                    placeholder={isSet ? "Leave blank to keep the saved value" : "Not set"}
                    value={secrets[field.key] ?? ""}
                    onChange={(e) =>
                      setSecrets((s) => ({ ...s, [field.key]: e.target.value }))
                    }
                    className="rounded border border-neutral-300 px-3 py-2 font-mono text-xs"
                  />
                </label>
              );
            })}
            <button
              type="button"
              onClick={() =>
                startTransition(async () => {
                  await saveArtistSecrets(artist.id, secrets);
                  setSecrets({});
                  setSecretsSaved(true);
                  router.refresh();
                })
              }
              className="self-start rounded border border-neutral-300 px-3 py-2 text-sm font-medium"
            >
              Save API keys
            </button>
            {secretsSaved && <p className="text-xs text-green-600">Saved.</p>}
          </div>
        </div>
      )}
    </form>
  );
}
