-- Run this after 025_youtube_section_order.sql.
-- Caches a screenshot of each artist's password/gate page (see
-- src/lib/screenshot.ts) so the builder's artist icons load a fast, direct
-- image instead of hitting a live third-party rendering service on every
-- single page view.

alter table artists
  add column if not exists gate_screenshot_url text;
