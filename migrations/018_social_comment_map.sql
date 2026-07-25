-- Run this after 017_music_albums.sql.
-- Replaces Social listening's data model: instead of a flat list of posts/
-- videos mentioning the artist, this stores actual comments (Reddit +
-- YouTube), pre-clustered by Gemini into a category -> subcategory ->
-- comments tree for the zoomable map UI. The old social_mentions table is
-- left in place (harmless, just no longer read by this tab).

create table if not exists social_comment_map (
  artist_id uuid primary key references artists (id) on delete cascade,
  categories jsonb not null default '[]'::jsonb,
  comment_count integer not null default 0,
  computed_at timestamptz not null default now()
);

alter table social_comment_map enable row level security;

create policy "social_comment_map_admin_all" on social_comment_map
  for all using (is_builder_admin()) with check (is_builder_admin());

create policy "social_comment_map_member_select" on social_comment_map
  for select using (is_artist_member(artist_id));
