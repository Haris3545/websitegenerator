-- Run this after 007_publish.sql.
-- Background media (image or video, auto-detected like the main site's
-- Background/Landing page fields) for the password gate page itself.

alter table artists
  add column if not exists gate_background_url text;
