-- Run this after 018_social_comment_map.sql.
-- Lets the builder admin organize artist dashboards into folders with
-- drag-and-drop, and gives both artists and folders a manual sort order.
-- Folders are a purely internal organizational concept (never read by an
-- artist-facing /s/[slug] page), so this only needs the admin policy, not
-- an is_artist_member() select policy like the artist-data tables.

create table if not exists artist_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table artist_folders enable row level security;

create policy "artist_folders_admin_all" on artist_folders
  for all using (is_builder_admin()) with check (is_builder_admin());

alter table artists
  add column if not exists folder_id uuid references artist_folders (id) on delete set null,
  add column if not exists sort_order integer not null default 0;
