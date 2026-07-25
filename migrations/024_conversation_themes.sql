-- Run this after 023_gemini_usage.sql.
-- Stores the Social listening tab's cross-source "conversation themes"
-- breakdown (Wikipedia article extracts + YouTube comments + press
-- coverage, scored against a fixed vibe taxonomy — see
-- src/lib/conversationThemes.ts) so it follows the same compute-once,
-- serve-cached-plus-background-refresh pattern as every other data source
-- in this app.

create table if not exists conversation_themes (
  artist_id uuid primary key references artists (id) on delete cascade,
  themes jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now()
);

alter table conversation_themes enable row level security;

create policy "conversation_themes_admin_all" on conversation_themes
  for all using (is_builder_admin()) with check (is_builder_admin());

create policy "conversation_themes_member_select" on conversation_themes
  for select using (is_artist_member(artist_id));
