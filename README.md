# Website Generator — artist cultural-intelligence dashboards

Phase 1: an internal builder (`/builder`) for configuring per-artist dashboard
sites, and the generated sites themselves (`/s/<slug>`) with a live Dashboard
and Media (Google News) tab. Remaining tabs are structural placeholders,
built out in later phases.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. Run `migrations/001_init.sql` in the Supabase SQL editor.
3. In Storage, create a public bucket named `artist-media` (background images
   and landing videos upload here).
4. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — from your Supabase project's API settings
   - `ANTHROPIC_API_KEY` — used to parse the aesthetic-tailoring textbox into CSS params
   - `ARTIST_SECRETS_ENCRYPTION_KEY` — generate with `openssl rand -hex 32`
   - `GOOGLE_FONTS_API_KEY` — optional, unlocks the full Google Fonts catalog instead of the bundled curated list
5. Create your own account (Supabase Auth → Users → Add user, or sign up
   through the app once a sign-up flow exists), then bootstrap yourself as a
   builder admin:
   ```sql
   insert into builder_admins (user_id) values ('<your-auth-user-uuid>');
   ```
6. `npm install && npm run dev`, then visit `/builder`.

## Structure

- `/builder` — internal admin: create/edit artist configs, upload media,
  manage API keys (encrypted at rest).
- `/s/<slug>` — the generated per-artist site. Access requires a Supabase Auth
  account; RLS on the `artists` table (see the migration) is what actually
  authorizes viewing a specific artist — builder admins see everything,
  everyone else needs a row in `artist_members`.

## Phases

- **Phase 1 (this)**: builder shell, Supabase schema, generated-site shell
  (header/ticker/nav/footer), Dashboard + Media tabs live.
- **Phase 2**: Social listening (YouTube/Reddit), Music (Last.fm/kworb),
  Audience (GWI upload + parsing).
- **Phase 3**: Strategy, Tactics, Locations, Ideas, Calendar, Research.
- **Phase 4**: real per-artist Vercel deployment automation.
