# Website Generator — artist cultural-intelligence dashboards

An internal builder (`/builder`) for configuring per-artist cultural-
intelligence dashboards, and the generated sites themselves (`/s/<slug>`) —
Dashboard, Media, Music, Social listening, Audience, YouTube, Locations,
Calendar, and board-style Strategy/Tactics/Ideas/Research tabs, all backed
by a shared Supabase project. Nothing in this codebase is tied to any one
person's account — every external integration goes through an environment
variable (see `.env.example`), so standing up your own copy is entirely a
matter of your own Supabase project + your own API keys, not anyone else's.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. Run every file in `migrations/`, in order, in the Supabase SQL editor.
3. In Storage, create a public bucket named `artist-media` (background
   images, landing videos, and uploaded pictures/GIFs live here).
4. Copy `.env.example` to `.env.local` and fill in at least the required
   Supabase + Gemini values — see that file for what every other variable
   does and which features are optional without it.
5. Create your own account (Supabase Auth → Users → Add user), then
   bootstrap yourself as a builder admin:
   ```sql
   insert into builder_admins (user_id) values ('<your-auth-user-uuid>');
   ```
6. `npm install && npm run dev`, then visit `/builder`.

If you're picking this codebase up from someone else rather than starting
fresh, see `HANDOFF.md` first — it covers what needs to move to your own
accounts versus what can be reused as-is.

## Structure

- `/builder` — internal admin: create/edit artist configs, upload media,
  set per-feature API keys, publish/unpublish a standalone site per artist.
- `/s/<slug>` — the generated per-artist site. A first-time visitor enters a
  per-artist password (set in the builder) to get in; RLS on the `artists`
  table (see the migrations) is the actual authorization boundary — builder
  admins see everything, everyone else needs a row in `artist_members`.
- **Publishing** (optional, see `.env.example`): the builder's "Publish"
  button generates a standalone GitHub repo + Vercel project per artist from
  this same codebase as a template, pinned to that one artist
  (`PINNED_ARTIST_SLUG`) with editing disabled. Requires this repo to be
  marked as a GitHub template and `GITHUB_TEMPLATE_OWNER`/`GITHUB_TEMPLATE_REPO`
  to point at wherever you've put it.
