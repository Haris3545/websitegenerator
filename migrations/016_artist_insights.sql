-- Run this after 015_event_coordinates.sql.
-- Backs the Dashboard's insight cards. artist_metric_snapshots is an
-- append-only log of key numbers each time a full refresh runs, so
-- genuine week-over-week deltas ("subscribers up 340 since last check")
-- become available once there's more than one snapshot — the first-ever
-- refresh for an artist won't have anything to compare against yet, which
-- is correct: a claimed trend needs two points, not one. artist_insights
-- caches the generated cards themselves so they aren't regenerated on
-- every page load.

create table if not exists artist_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists (id) on delete cascade,
  captured_at timestamptz not null default now(),
  metrics jsonb not null default '{}'::jsonb
);

create index if not exists artist_metric_snapshots_artist_time_idx
  on artist_metric_snapshots (artist_id, captured_at desc);

alter table artist_metric_snapshots enable row level security;

create policy "artist_metric_snapshots_admin_all" on artist_metric_snapshots
  for all using (is_builder_admin()) with check (is_builder_admin());

create policy "artist_metric_snapshots_member_select" on artist_metric_snapshots
  for select using (is_artist_member(artist_id));

create table if not exists artist_insights (
  artist_id uuid primary key references artists (id) on delete cascade,
  insights jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now()
);

alter table artist_insights enable row level security;

create policy "artist_insights_admin_all" on artist_insights
  for all using (is_builder_admin()) with check (is_builder_admin());

create policy "artist_insights_member_select" on artist_insights
  for select using (is_artist_member(artist_id));
