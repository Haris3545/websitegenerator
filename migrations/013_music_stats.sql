-- Run this after 012_social_mentions.sql.
-- Phase 2: backs the Music tab — Last.fm listener/playcount stats, top
-- tags, and top tracks. Needs the artist's lastfm_api_key (already a
-- secret field in the builder).

create table if not exists music_stats (
  artist_id uuid primary key references artists (id) on delete cascade,
  listeners bigint,
  playcount bigint,
  top_tags text[] not null default '{}',
  top_tracks jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);

alter table music_stats enable row level security;

create policy "music_stats_admin_all" on music_stats
  for all using (is_builder_admin()) with check (is_builder_admin());

create policy "music_stats_member_select" on music_stats
  for select using (is_artist_member(artist_id));
