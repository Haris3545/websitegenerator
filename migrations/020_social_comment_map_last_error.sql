-- Run this after 019_artist_folders.sql.
-- Lets refreshSocialListeningForArtist record WHY a refresh came back with
-- zero comments (e.g. Reddit's public search endpoint blocking a
-- datacenter/serverless IP, or YOUTUBE_API_KEY not being set) so the
-- Social listening tab's empty state can show a real reason instead of a
-- generic "no comments found" regardless of cause.

alter table social_comment_map
  add column if not exists last_error text;
