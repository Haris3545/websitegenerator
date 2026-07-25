-- Run this after 016_artist_insights.sql.
-- Backs the Music tab's cover-flow browser — top albums (from Last.fm)
-- paired with real artwork (from Apple's iTunes Search API, since Last.fm's
-- own image URLs have been broken placeholders for years now).

alter table music_stats
  add column if not exists top_albums jsonb not null default '[]'::jsonb;
