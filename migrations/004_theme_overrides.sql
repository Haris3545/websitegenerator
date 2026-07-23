-- Run this after 003_project_title.sql.
-- Stores the fine-tuning values set from the builder's new click-to-select
-- visual editor (card roundedness/opacity, header bold/italic, background
-- contrast/saturation/darkness). Kept separate from aesthetic_params, which
-- stays driven by the Gemini-parsed free-text box.

alter table artists
  add column if not exists theme_overrides jsonb not null default '{}'::jsonb;
