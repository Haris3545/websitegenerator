-- Run this after 005_sentiment_summary.sql.
-- Backs the right-click-to-edit-text feature on the generated site: a flat
-- map of contentKey -> overridden text, checked by every editable piece of
-- static copy (see src/components/site/Editable.tsx) before falling back to
-- the text baked into the component.

alter table artists
  add column if not exists content_overrides jsonb not null default '{}'::jsonb;
