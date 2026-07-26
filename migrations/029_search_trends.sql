-- Run this after 028_genius_annotations.sql.
-- Caches Google Trends search-interest-over-time data (via SerpApi) shown
-- alongside the Dashboard's Wikipedia pageviews section (see
-- src/lib/googleTrends.ts).

create table if not exists search_trends (
  artist_id uuid primary key references artists (id) on delete cascade,
  points jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now()
);

alter table search_trends enable row level security;

create policy "search_trends_admin_all" on search_trends
  for all using (is_builder_admin()) with check (is_builder_admin());

create policy "search_trends_member_select" on search_trends
  for select using (is_artist_member(artist_id));
