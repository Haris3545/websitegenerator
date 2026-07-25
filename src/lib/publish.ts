import { createServiceRoleClient } from "@/lib/supabase/server";

const GITHUB_API = "https://api.github.com";
const VERCEL_API = "https://api.vercel.com";
const TEMPLATE_OWNER = "Haris3545";
const TEMPLATE_REPO = "websitegenerator";

// Copied straight from this deployment's own environment onto the new
// project, so the standalone site talks to the same Supabase project
// without the user re-entering anything.
const ENV_VARS_TO_COPY = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_FONTS_API_KEY",
  "CRON_SECRET",
  "YOUTUBE_API_KEY",
  "LASTFM_API_KEY",
  "TICKETMASTER_API_KEY",
];

export type PublishResult =
  | { ok: true; repoUrl: string; siteUrl: string }
  | { ok: false; error: string };

/** Publishes an artist to their own standalone GitHub repo + Vercel project:
 * generates a fresh repo from this app's template, creates a Vercel project
 * linked to it with this deployment's own env vars copied over plus a
 * PINNED_ARTIST_SLUG override (see middleware.ts / app/page.tsx) that locks
 * that deployment to just this one artist's dashboard. Idempotent — if
 * already published, just returns the stored URLs instead of publishing
 * again (the repo/project would already exist). */
export async function publishArtistSite(artistId: string): Promise<PublishResult> {
  const githubToken = process.env.GITHUB_ACCESS_TOKEN;
  const vercelToken = process.env.VERCEL_API_TOKEN;
  if (!githubToken) {
    return { ok: false, error: "GITHUB_ACCESS_TOKEN isn't set in this deployment's environment variables." };
  }
  if (!vercelToken) {
    return { ok: false, error: "VERCEL_API_TOKEN isn't set in this deployment's environment variables." };
  }

  const supabase = createServiceRoleClient();
  const { data: artist, error: fetchError } = await supabase
    .from("artists")
    .select("slug, name, published_repo_url, published_site_url")
    .eq("id", artistId)
    .maybeSingle();

  if (fetchError) return { ok: false, error: `Couldn't load artist: ${fetchError.message}` };
  if (!artist) return { ok: false, error: "Artist not found." };

  if (artist.published_repo_url && artist.published_site_url) {
    return { ok: true, repoUrl: artist.published_repo_url, siteUrl: artist.published_site_url };
  }

  const repoName = `${artist.slug}-dashboard`;

  // 1. Create the repo by generating a full copy from the template — this
  // requires "Template repository" to be checked in this repo's GitHub
  // settings (Settings > General).
  const generateRes = await fetch(`${GITHUB_API}/repos/${TEMPLATE_OWNER}/${TEMPLATE_REPO}/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      owner: TEMPLATE_OWNER,
      name: repoName,
      private: true,
      include_all_branches: false,
      description: `Standalone dashboard for ${artist.name}`,
    }),
  });

  if (!generateRes.ok) {
    const body = await generateRes.text();
    return {
      ok: false,
      error: `GitHub repo creation failed (${generateRes.status}): ${body}`,
    };
  }

  const repoData = await generateRes.json();
  const repoFullName: string = repoData.full_name;
  const repoUrl: string = repoData.html_url;

  // 2. Create a Vercel project linked to the new repo, with env vars set at
  // creation time (setting them afterward would miss the first auto-deploy
  // that fires as soon as the git repo is linked).
  const envVars = ENV_VARS_TO_COPY.filter((key) => process.env[key]).map((key) => ({
    key,
    value: process.env[key] as string,
    type: "encrypted" as const,
    target: ["production", "preview", "development"],
  }));
  envVars.push({
    key: "PINNED_ARTIST_SLUG",
    value: artist.slug,
    type: "encrypted",
    target: ["production", "preview", "development"],
  });

  const createProjectRes = await fetch(`${VERCEL_API}/v11/projects`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${vercelToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: repoName,
      framework: "nextjs",
      gitRepository: { type: "github", repo: repoFullName },
      environmentVariables: envVars,
    }),
  });

  if (!createProjectRes.ok) {
    const body = await createProjectRes.text();
    return {
      ok: false,
      error:
        `Vercel project creation failed (${createProjectRes.status}): ${body}. ` +
        `The GitHub repo was already created at ${repoUrl} — delete it before retrying, or the next ` +
        "attempt will fail trying to recreate it.",
    };
  }

  const projectData = await createProjectRes.json();
  const siteUrl = `https://${projectData.name}.vercel.app`;

  await supabase
    .from("artists")
    .update({
      published_repo_url: repoUrl,
      published_site_url: siteUrl,
      published_at: new Date().toISOString(),
    })
    .eq("id", artistId);

  return { ok: true, repoUrl, siteUrl };
}

export type UnpublishResult = { ok: true } | { ok: false; error: string };

/** Deletes the standalone GitHub repo + Vercel project created by
 * publishArtistSite and clears the stored URLs, so the artist can be
 * published fresh again (e.g. to pick up template changes made since the
 * original publish — there's no in-place sync yet, only republish-from-
 * scratch). Idempotent — a 404 from either API (already deleted) is treated
 * as success rather than an error. */
export async function unpublishArtistSite(artistId: string): Promise<UnpublishResult> {
  const githubToken = process.env.GITHUB_ACCESS_TOKEN;
  const vercelToken = process.env.VERCEL_API_TOKEN;
  if (!githubToken) {
    return { ok: false, error: "GITHUB_ACCESS_TOKEN isn't set in this deployment's environment variables." };
  }
  if (!vercelToken) {
    return { ok: false, error: "VERCEL_API_TOKEN isn't set in this deployment's environment variables." };
  }

  const supabase = createServiceRoleClient();
  const { data: artist, error: fetchError } = await supabase
    .from("artists")
    .select("slug, published_repo_url")
    .eq("id", artistId)
    .maybeSingle();

  if (fetchError) return { ok: false, error: `Couldn't load artist: ${fetchError.message}` };
  if (!artist) return { ok: false, error: "Artist not found." };
  if (!artist.published_repo_url) return { ok: false, error: "This artist hasn't been published." };

  const repoName = `${artist.slug}-dashboard`;
  const errors: string[] = [];

  const deleteProjectRes = await fetch(`${VERCEL_API}/v9/projects/${repoName}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${vercelToken}` },
  });
  if (!deleteProjectRes.ok && deleteProjectRes.status !== 404) {
    const body = await deleteProjectRes.text();
    errors.push(`Vercel project deletion failed (${deleteProjectRes.status}): ${body}`);
  }

  const deleteRepoRes = await fetch(`${GITHUB_API}/repos/${TEMPLATE_OWNER}/${repoName}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!deleteRepoRes.ok && deleteRepoRes.status !== 404) {
    const body = await deleteRepoRes.text();
    errors.push(
      `GitHub repo deletion failed (${deleteRepoRes.status}): ${body}. This usually means ` +
        `GITHUB_ACCESS_TOKEN is missing the "delete_repo" scope — edit the token at ` +
        "github.com/settings/tokens to add it, then try again."
    );
  }

  if (errors.length) return { ok: false, error: errors.join(" ") };

  await supabase
    .from("artists")
    .update({ published_repo_url: null, published_site_url: null, published_at: null })
    .eq("id", artistId);

  return { ok: true };
}
