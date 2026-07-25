-- Run this after 011_youtube_stats.sql.
-- Phase 2: backs the Social listening tab — Reddit posts and YouTube videos
-- mentioning the artist. Needs a Reddit client ID + secret and/or a YouTube
-- Data API key (already secret fields in the builder); either alone is
-- enough, both together cover more ground.

create table if not exists social_mentions (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists (id) on delete cascade,
  platform text not null,
  title text not null,
  url text not null,
  author text,
  excerpt text not null default '',
  score integer,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  unique (artist_id, url)
);

create index if not exists social_mentions_artist_id_idx on social_mentions (artist_id);

alter table social_mentions enable row level security;

create policy "social_mentions_admin_all" on social_mentions
  for all using (is_builder_admin()) with check (is_builder_admin());

create policy "social_mentions_member_select" on social_mentions
  for select using (is_artist_member(artist_id));
