-- Run this after 008_gate_background.sql.
-- Phase 3: backs the interactive Strategy/Tactics/Ideas/Research tabs — a
-- simple per-artist, per-board list of cards (title + notes) that can be
-- added and removed directly from the site.

create table if not exists board_items (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists (id) on delete cascade,
  board_key text not null check (board_key in ('strategy', 'tactics', 'ideas', 'research')),
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists board_items_artist_board_idx
  on board_items (artist_id, board_key, created_at);

alter table board_items enable row level security;

-- Same shape as media_articles: builder admins get full access via RLS;
-- the generated site itself reads/writes through the service-role client
-- (see s/[slug]/actions.ts), matching every other site-side table.
create policy "board_items_admin_all" on board_items
  for all using (is_builder_admin()) with check (is_builder_admin());

create policy "board_items_member_select" on board_items
  for select using (is_artist_member(artist_id));
