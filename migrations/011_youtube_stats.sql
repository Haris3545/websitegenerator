-- Run this after 010_artist_events.sql.
-- Phase 2: backs the YouTube tab — channel stats + recent videos, cached
-- per artist. Needs the artist's YouTube channel ID (plain config, not a
-- secret) and their youtube_api_key (already a secret field in the builder).

alter table artists
  add column if not exists youtube_channel_id text;

create table if not exists youtube_stats (
  artist_id uuid primary key references artists (id) on delete cascade,
  channel_title text,
  subscriber_count bigint,
  view_count bigint,
  video_count bigint,
  recent_videos jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);

alter table youtube_stats enable row level security;

create policy "youtube_stats_admin_all" on youtube_stats
  for all using (is_builder_admin()) with check (is_builder_admin());

create policy "youtube_stats_member_select" on youtube_stats
  for select using (is_artist_member(artist_id));
