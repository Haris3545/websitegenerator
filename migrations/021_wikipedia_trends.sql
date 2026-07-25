-- Run this after 020_social_comment_map_last_error.sql.
-- Stores the Dashboard's Wikipedia pageviews section so it can follow the
-- same block-only-if-never-computed / else-serve-cached-plus-background-
-- refresh pattern as every other data source in this app, instead of
-- blocking the Dashboard's render on every cache miss.

create table if not exists wikipedia_trends (
  artist_id uuid primary key references artists (id) on delete cascade,
  articles jsonb not null default '[]'::jsonb,
  top_mover jsonb,
  computed_at timestamptz not null default now()
);

alter table wikipedia_trends enable row level security;

create policy "wikipedia_trends_admin_all" on wikipedia_trends
  for all using (is_builder_admin()) with check (is_builder_admin());

create policy "wikipedia_trends_member_select" on wikipedia_trends
  for select using (is_artist_member(artist_id));
