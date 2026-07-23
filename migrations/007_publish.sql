-- Run this after 006_content_overrides.sql.
-- Tracks the standalone GitHub repo + Vercel project created by the
-- builder's "Publish" button, so it's only created once per artist.

alter table artists
  add column if not exists published_repo_url text,
  add column if not exists published_site_url text,
  add column if not exists published_at timestamptz;
