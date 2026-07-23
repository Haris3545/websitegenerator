-- Phase 1 schema for the artist cultural-intelligence dashboard generator.
-- Run this in the Supabase SQL editor for a fresh project.

create extension if not exists pgcrypto;

-- Every internal team member who logs into the builder is a Supabase Auth
-- user; being listed here is what makes them an admin of the builder itself
-- (separate from being a member of one specific artist's dashboard).
create table if not exists builder_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists artists (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,

  primary_color text not null default '#eab308',
  secondary_color text not null default '#0f172a',
  accent_color text not null default '#eab308',
  font_family text not null default 'Inter',

  background_image_url text,
  landing_video_url text,

  -- Free text like "film grain overlay, 30%", plus the structured params an
  -- LLM call derives from it at save time (grain_intensity, tint_opacity,
  -- blur, vignette — all 0..1). aesthetic_params is what the site actually
  -- renders with; aesthetic_prompt is kept so re-editing shows your original
  -- wording instead of a lossy re-description of the params.
  aesthetic_prompt text not null default '',
  aesthetic_params jsonb not null default '{}'::jsonb,

  tagline text not null default 'VCCP Cultural Intelligence',

  -- Which of the 11 content tabs are switched on for this artist, e.g.
  -- ["dashboard","media","music"]. Dashboard is always implicitly on.
  enabled_tabs jsonb not null default '["dashboard","media","social_listening","music","youtube","audience","strategy","tactics","locations","ideas","calendar","research"]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Per-artist third-party API keys (media/social/music/etc), encrypted at the
-- application layer before insert — this column never holds plaintext.
create table if not exists artist_secrets (
  artist_id uuid primary key references artists (id) on delete cascade,
  encrypted jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Client-facing accounts: which Supabase Auth users can see which artist's
-- dashboard, and whether they can also edit content tabs (Strategy/Tactics/
-- Ideas notes) or are view-only.
create table if not exists artist_members (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  unique (artist_id, user_id)
);

create table if not exists media_articles (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists (id) on delete cascade,
  title text not null,
  url text not null,
  source text not null,
  excerpt text not null default '',
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  unique (artist_id, url)
);

create index if not exists media_articles_artist_published_idx
  on media_articles (artist_id, published_at desc);

-- Uploaded GWI (or similar) audience research exports, parsed into rows of
-- (category, statement, metric, segment, value) at import time.
create table if not exists audience_uploads (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists (id) on delete cascade,
  filename text not null,
  uploaded_at timestamptz not null default now()
);

create table if not exists audience_statements (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references audience_uploads (id) on delete cascade,
  artist_id uuid not null references artists (id) on delete cascade,
  category text,
  statement text not null,
  segment text not null,
  universe numeric,
  responses numeric,
  column_pct numeric,
  row_pct numeric,
  index_value numeric
);

create index if not exists audience_statements_artist_idx
  on audience_statements (artist_id, segment);

alter table builder_admins enable row level security;
alter table artists enable row level security;
alter table artist_secrets enable row level security;
alter table artist_members enable row level security;
alter table media_articles enable row level security;
alter table audience_uploads enable row level security;
alter table audience_statements enable row level security;

create or replace function is_builder_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from builder_admins where user_id = auth.uid()
  );
$$;

create or replace function is_artist_member(check_artist_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from artist_members
    where artist_id = check_artist_id and user_id = auth.uid()
  );
$$;

-- builder_admins: admins can see the admin list; nobody else can.
create policy "builder_admins_select_self" on builder_admins
  for select using (is_builder_admin());

-- artists: builder admins have full access; artist members can read their
-- own artist's row (needed to render the dashboard shell/config).
create policy "artists_admin_all" on artists
  for all using (is_builder_admin()) with check (is_builder_admin());

create policy "artists_member_select" on artists
  for select using (is_artist_member(id));

-- artist_secrets: admin-only. Client dashboards never read this table
-- directly — API calls happen server-side with the service-role client.
create policy "artist_secrets_admin_all" on artist_secrets
  for all using (is_builder_admin()) with check (is_builder_admin());

-- artist_members: admins manage membership; members can see their own row.
create policy "artist_members_admin_all" on artist_members
  for all using (is_builder_admin()) with check (is_builder_admin());

create policy "artist_members_select_self" on artist_members
  for select using (user_id = auth.uid());

-- media_articles: readable by admins and by members of that artist.
create policy "media_articles_admin_all" on media_articles
  for all using (is_builder_admin()) with check (is_builder_admin());

create policy "media_articles_member_select" on media_articles
  for select using (is_artist_member(artist_id));

-- audience_uploads / audience_statements: same shape as media_articles.
create policy "audience_uploads_admin_all" on audience_uploads
  for all using (is_builder_admin()) with check (is_builder_admin());

create policy "audience_uploads_member_select" on audience_uploads
  for select using (is_artist_member(artist_id));

create policy "audience_statements_admin_all" on audience_statements
  for all using (is_builder_admin()) with check (is_builder_admin());

create policy "audience_statements_member_select" on audience_statements
  for select using (is_artist_member(artist_id));

-- Bootstrap: after creating your own Supabase Auth user (via the dashboard
-- or sign-up), run this once with your user's id to make yourself the
-- builder admin:
--   insert into builder_admins (user_id) values ('<your-auth-user-uuid>');

-- Storage: also create a public bucket named `artist-media` (Storage tab in
-- the Supabase dashboard, or `select storage.create_bucket('artist-media', public => true);`)
-- for background images and landing videos. Uploads are named
-- `<artist-slug>/background.<ext>` / `<artist-slug>/landing.<ext>`.
-- Then run 002_storage_and_defaults.sql — the bucket's "public" toggle only
-- covers downloads; uploads need their own RLS policy on storage.objects.
