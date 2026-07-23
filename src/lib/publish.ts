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
  "ARTIST_SECRETS_ENCRYPTION_KEY",
  "GOOGLE_FONTS_API_KEY",
  "CRON_SECRET",
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
