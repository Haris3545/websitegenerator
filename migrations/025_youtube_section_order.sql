-- Run this after 024_conversation_themes.sql.
-- Lets a visitor drag-reorder the YouTube tab's own content sections
-- ("Comment themes", "Channel stats") in edit mode, permanently, the same
-- way the Dashboard's sections are already reorderable.

alter table artists
  add column if not exists youtube_section_order jsonb not null default '["comments", "stats"]'::jsonb;
