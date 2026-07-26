-- Run this after 029_search_trends.sql.
-- Tracks the Vercel deployment explicitly triggered by publishArtistSite
-- (see src/lib/publish.ts), so the builder can poll real build status
-- (queued/building/ready/error) instead of just assuming publish = live.

alter table artists
  add column if not exists published_deployment_id text;
