-- Run this after 009_board_items.sql.
-- Phase 3: backs the Locations + Calendar tabs — cached upcoming tour dates
-- from Bandsintown, refreshed on the same lazy-staleness pattern as
-- media_articles.

create table if not exists artist_events (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists (id) on delete cascade,
  event_date timestamptz not null,
  venue text not null,
  city text not null default '',
  country text not null default '',
  url text,
  source text not null default 'bandsintown',
  fetched_at timestamptz not null default now(),
  unique (artist_id, event_date, venue)
);

create index if not exists artist_events_artist_date_idx
  on artist_events (artist_id, event_date);

alter table artist_events enable row level security;

create policy "artist_events_admin_all" on artist_events
  for all using (is_builder_admin()) with check (is_builder_admin());

create policy "artist_events_member_select" on artist_events
  for select using (is_artist_member(artist_id));
