# Handing this project to a new owner

This app is built so that no code change is required to run it under a
different person's accounts — every external integration is an environment
variable, not a hardcoded credential (see `.env.example`). What's left is
purely account-level: moving or recreating a handful of things that
currently live under the outgoing operator's own accounts. Nothing below
requires touching source code; it's all dashboard clicks and one SQL
statement.

Split into three kinds of action: **rotate** (issue a fresh credential under
the new owner's own account — never reuse the old one), **transfer**
(move ownership of something that already exists), and **grant** (add the
new person without necessarily removing the old one, e.g. during an overlap
period).

## 1. GitHub

The repo (and, if you use the builder's "Publish" feature, the *template*
repo new artist sites get generated from) currently lives under the
outgoing operator's personal GitHub account.

- **Transfer**: GitHub Settings → General → Danger Zone → Transfer ownership,
  to the new owner's account or org. This keeps the same repo URL history,
  stars, and — importantly — its "Template repository" checkbox (Settings →
  General), which the Publish feature depends on.
- Alternative if a transfer isn't possible: the new owner forks or clones
  the repo into their own account, and you re-check "Template repository"
  on their copy.
- Either way, update `GITHUB_TEMPLATE_OWNER` / `GITHUB_TEMPLATE_REPO` in the
  Vercel project's env vars to the new location (see `.env.example`) — this
  is the one place the repo's location is configured, not hardcoded.
- **Rotate**: `GITHUB_ACCESS_TOKEN` — generate a new Personal Access Token
  from the new owner's GitHub account (github.com/settings/tokens; classic
  token needs `repo` + `delete_repo` scopes) and set it in Vercel. Revoke
  the old one once confirmed working.

## 2. Vercel

The deployment hosting the builder app (and, if used, every published
artist's own standalone project) lives under the outgoing operator's Vercel
account/team.

- **Transfer**: Vercel → Project Settings → Transfer, or invite the new
  owner to the Vercel team and transfer team ownership
  (vercel.com/docs/accounts/team-members-and-roles). Any per-artist
  standalone projects created by Publish live in the same account/team and
  transfer along with it.
- **Rotate**: `VERCEL_API_TOKEN` — generate a new token from the new owner's
  account (vercel.com/account/tokens) and set it as an env var on the
  project. Revoke the old one afterward.
- If a transfer genuinely isn't possible, the fallback is redeploying this
  repo fresh under the new owner's own Vercel account and pointing DNS (if
  a custom domain is in use) at the new deployment.

## 3. Supabase

This is the one that actually matters most — it holds every artist's real
data (articles, stats, uploads, board items, everything), not just
configuration.

- **Best option — transfer the project**: Supabase supports transferring a
  project to a different organization
  (supabase.com/docs/guides/platform/project-transfer). This keeps all data,
  all history, zero migration work. Do this if the new owner can accept a
  transfer into an org they control.
- **Fallback — new project, migrate data**: if a transfer isn't possible,
  create a fresh Supabase project under the new owner's account, run every
  file in `migrations/` in order, then migrate the actual rows over
  (Supabase's own dashboard has a data migration/backup-restore path, or
  `pg_dump`/`pg_restore` between the two Postgres instances directly).
- Either way, update `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  / `SUPABASE_SERVICE_ROLE_KEY` in Vercel if the project itself changed.
- **Grant, then optionally revoke**: add the new owner as a builder admin
  without removing the outgoing operator immediately, so there's a working
  overlap period:
  ```sql
  -- new owner signs up / gets a Supabase Auth account first, then:
  insert into builder_admins (user_id) values ('<new-owner-auth-user-uuid>');
  ```
  Once they've confirmed access, remove the outgoing operator's own row if
  they're leaving the project entirely:
  ```sql
  delete from builder_admins where user_id = '<outgoing-operator-auth-user-uuid>';
  ```

## 4. Third-party API keys

Every key below was almost certainly created under the outgoing operator's
own account with that provider (even a "free" key is still owned by
whoever's account generated it — usage, rate limits, and the ability to
revoke it all sit with that account). **Rotate all of these** — generate a
fresh one under the new owner's own account with each provider, rather than
continuing to run on the outgoing operator's:

| Variable | Provider |
| --- | --- |
| `GEMINI_API_KEY` | Google AI Studio |
| `YOUTUBE_API_KEY` | Google Cloud Console |
| `GOOGLE_FONTS_API_KEY` | Google Cloud Console |
| `LASTFM_API_KEY` | Last.fm |
| `TICKETMASTER_API_KEY` | Ticketmaster Developer Portal |
| `NEWSAPI_KEY` | NewsAPI.org |
| `GENIUS_ACCESS_TOKEN` | Genius API Clients |
| `SERPAPI_KEY` | SerpApi |
| `GIPHY_API_KEY` | Giphy Developers |

None of these need to match their old values — the app reads whatever's
currently set. Update each in the Vercel project's env vars as it's
rotated; nothing else in the codebase references the old ones.

## 5. Things that need no action

- **`CRON_SECRET`**: a shared secret the app invented for itself, not tied
  to any external account. Fine to leave as-is, or rotate freely — just
  keep the Vercel env var and this value in sync.
- **`ARTIST_SECRETS_ENCRYPTION_KEY`**: an older README mentioned this, but
  the per-artist encrypted-secrets feature it was for was never actually
  built (the `artist_secrets` table exists in the schema but nothing in the
  app reads or writes it). Safe to ignore — don't bother setting it.
- **Domain/DNS**: if a custom domain points at this deployment, that lives
  in whichever registrar/DNS provider account registered it — not covered
  here since it's outside this codebase entirely, but worth checking before
  considering the handoff complete.

## Verifying the handoff worked

Once every credential above is rotated and ownership transferred:
1. Confirm the new owner can log into `/builder` with their own Supabase
   Auth account.
2. Create a throwaway test artist end-to-end (create → refresh data →
   publish, if you use that feature) using only the new credentials.
3. Revoke every one of the outgoing operator's old tokens/keys — a
   successful test in step 2 confirms nothing is silently still depending
   on them.
