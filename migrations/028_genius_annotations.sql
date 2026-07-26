-- Run this after 027_conversation_themes_word_cloud.sql.
-- Caches Genius API lyric annotations (fan-submitted "what does this line
-- mean" text) shown on the Music tab and folded into the Social listening
-- word cloud/themes corpus (see src/lib/genius.ts).

create table if not exists genius_annotations (
  artist_id uuid primary key references artists (id) on delete cascade,
  annotations jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now()
);

alter table genius_annotations enable row level security;

create policy "genius_annotations_admin_all" on genius_annotations
  for all using (is_builder_admin()) with check (is_builder_admin());

create policy "genius_annotations_member_select" on genius_annotations
  for select using (is_artist_member(artist_id));
