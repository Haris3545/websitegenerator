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
  "NEWSAPI_KEY",
  "GENIUS_ACCESS_TOKEN",
  "SERPAPI_KEY",
];

export type PublishResult =
  | { ok: true; repoUrl: string; siteUrl: string; deploymentId: string | null }
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
    .select("slug, name, published_repo_url, published_site_url, published_deployment_id")
    .eq("id", artistId)
    .maybeSingle();

  if (fetchError) return { ok: false, error: `Couldn't load artist: ${fetchError.message}` };
  if (!artist) return { ok: false, error: "Artist not found." };

  if (artist.published_repo_url && artist.published_site_url) {
    return {
      ok: true,
      repoUrl: artist.published_repo_url,
      siteUrl: artist.published_site_url,
      deploymentId: artist.published_deployment_id,
    };
  }

  const repoName = `${artist.slug}-cultural-engine`;

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
    const hint =
      generateRes.status === 404
        ? ` This almost always means either (a) "Template repository" isn't checked in ` +
          `${TEMPLATE_OWNER}/${TEMPLATE_REPO}'s GitHub Settings > General, or (b) GITHUB_ACCESS_TOKEN ` +
          `can't see that repo — a classic token needs the "repo" scope, a fine-grained token needs to be ` +
          `explicitly granted access to ${TEMPLATE_OWNER}/${TEMPLATE_REPO} with Contents read/write.`
        : "";
    return {
      ok: false,
      error: `GitHub repo creation failed (${generateRes.status}): ${body}.${hint}`,
    };
  }

  const repoData = await generateRes.json();
  const repoFullName: string = repoData.full_name;
  const repoUrl: string = repoData.html_url;
  const repoId: number = repoData.id;
  const defaultBranch: string = repoData.default_branch ?? "main";

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

  // 3. Generating a repo from a template doesn't emit a "push" event the
  // way a real commit does, so Vercel's GitHub integration never learns
  // there's a new commit to build — left alone, the project just sits
  // there with zero deployments ("deployment not found") until someone
  // manually triggers one from the Vercel dashboard. Triggering a
  // deployment explicitly here is what actually makes Publish result in a
  // live site with no manual step. A failure here doesn't fail the whole
  // publish (the repo and project already exist for real) — deploymentId
  // just stays null, and checkPublishStatus reports that as "unknown"
  // rather than crashing on it.
  let deploymentId: string | null = null;
  // The project's own "<name>.vercel.app" alias only gets pointed at a
  // deployment that Vercel's git integration deployed automatically via a
  // real push webhook — a deployment triggered directly through this API
  // call, on a repo that was never actually pushed to, does NOT
  // necessarily get that alias assigned, even once it's fully built and
  // READY. That mismatch is exactly what caused "waited for Live, then
  // 404 DEPLOYMENT_NOT_FOUND" — the guessed "<name>.vercel.app" URL simply
  // never had anything behind it. The deployment creation response's own
  // `url` field is the one URL Vercel actually guarantees will resolve to
  // this specific deployment once it finishes building, so that's what
  // gets stored — falling back to the guessed alias only if the deployment
  // call itself failed outright.
  let siteUrl = `https://${projectData.name}.vercel.app`;
  const createDeploymentRes = await fetch(`${VERCEL_API}/v13/deployments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${vercelToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: repoName,
      project: projectData.id,
      target: "production",
      gitSource: { type: "github", repoId, ref: defaultBranch },
    }),
  });

  if (createDeploymentRes.ok) {
    const deploymentData = await createDeploymentRes.json();
    deploymentId = deploymentData.id ?? null;
    if (deploymentData.url) siteUrl = `https://${deploymentData.url}`;
  } else {
    const body = await createDeploymentRes.text();
    console.error(`publishArtistSite: triggering the initial deployment failed for ${artist.slug}: ${body}`);
  }

  await supabase
    .from("artists")
    .update({
      published_repo_url: repoUrl,
      published_site_url: siteUrl,
      published_deployment_id: deploymentId,
      published_at: new Date().toISOString(),
    })
    .eq("id", artistId);

  return { ok: true, repoUrl, siteUrl, deploymentId };
}

export type PublishStatus =
  | { status: "queued" | "building" }
  | { status: "ready"; siteUrl?: string }
  | { status: "error"; message: string }
  | { status: "unknown" };

/** Polls Vercel's own deployment status rather than assuming "Publish
 * succeeded" means "the site is live" — the repo/project can exist for
 * minutes before a build actually finishes (or fails). "unknown" covers
 * both a never-recorded deployment id and a deleted/inaccessible one, so
 * the builder UI can fall back to "check the Vercel dashboard" instead of
 * hanging on a spinner forever.
 *
 * Once a build reaches READY, this also assigns the project's clean
 * "<slug>-cultural-engine.vercel.app" alias to that deployment. That alias
 * doesn't get pointed here automatically — Vercel only auto-assigns it off
 * the back of a real git-push webhook, and these deployments are triggered
 * directly via the API (see the long comment in publishArtistSite) — so
 * without this step the stored URL stays the long, hash-suffixed one Vercel
 * handed back at creation time (e.g. "charli-xcx-cultural-engine-<hash>-
 * <account>.vercel.app") instead of the short one people actually want to
 * share. */
export async function checkPublishStatus(artistId: string): Promise<PublishStatus> {
  const vercelToken = process.env.VERCEL_API_TOKEN;
  if (!vercelToken) return { status: "unknown" };

  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("slug, published_deployment_id, published_site_url")
    .eq("id", artistId)
    .maybeSingle();

  const deploymentId = artist?.published_deployment_id;
  if (!deploymentId) return { status: "unknown" };

  const res = await fetch(`${VERCEL_API}/v13/deployments/${deploymentId}`, {
    headers: { Authorization: `Bearer ${vercelToken}` },
  });
  if (!res.ok) return { status: "unknown" };

  const data = await res.json();
  const readyState: string = data.readyState ?? "";

  if (readyState === "READY") {
    let siteUrl = artist?.published_site_url ?? undefined;
    const cleanAlias = artist?.slug ? `${artist.slug}-cultural-engine.vercel.app` : null;
    if (cleanAlias && siteUrl !== `https://${cleanAlias}`) {
      const aliasRes = await fetch(`${VERCEL_API}/v2/deployments/${deploymentId}/aliases`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${vercelToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ alias: cleanAlias }),
      });
      if (aliasRes.ok) {
        siteUrl = `https://${cleanAlias}`;
        await supabase.from("artists").update({ published_site_url: siteUrl }).eq("id", artistId);
      } else {
        console.error(`checkPublishStatus: alias assignment failed for ${artist?.slug}:`, await aliasRes.text());
      }
    }
    return { status: "ready", siteUrl };
  }
  if (readyState === "ERROR" || readyState === "CANCELED") {
    return { status: "error", message: data.errorMessage ?? `Deployment ${readyState.toLowerCase()}.` };
  }
  if (readyState === "BUILDING" || readyState === "INITIALIZING") return { status: "building" };
  return { status: "queued" };
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

  // Derived from the stored repo URL (its last path segment) rather than
  // recomputed from the slug, since the naming convention has changed over
  // time (from "-dashboard" to "-cultural-engine") — this way unpublish
  // still finds the right repo/project regardless of when an artist was
  // originally published.
  const repoName = artist.published_repo_url.split("/").filter(Boolean).pop()!;
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
    .update({
      published_repo_url: null,
      published_site_url: null,
      published_deployment_id: null,
      published_at: null,
    })
    .eq("id", artistId);

  return { ok: true };
}
