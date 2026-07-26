-- Run this after 026_gate_screenshot.sql.
-- Adds a word/phrase-frequency cloud alongside the existing theme
-- breakdown on the Social listening tab (see src/lib/conversationThemes.ts).

alter table conversation_themes
  add column if not exists word_cloud jsonb not null default '[]'::jsonb;
