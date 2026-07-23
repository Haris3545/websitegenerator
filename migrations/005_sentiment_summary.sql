-- Run this after 004_theme_overrides.sql.
-- Caches the LLM-generated sentiment breakdown + topic filters shown at the
-- top of the Dashboard tab, so it's not recomputed on every page load.

alter table artists
  add column if not exists sentiment_summary jsonb not null default '{}'::jsonb;
