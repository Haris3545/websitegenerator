-- Run this after 021_wikipedia_trends.sql.
-- Lets a visitor drag-reorder the Dashboard's content sections ("What
-- we've noticed", "Wikipedia pageviews", "Most relevant coverage") in edit
-- mode, permanently, the same way tabs/KPI cards are already reorderable.

alter table artists
  add column if not exists dashboard_section_order jsonb not null default '["insights", "wikipedia", "coverage"]'::jsonb;
