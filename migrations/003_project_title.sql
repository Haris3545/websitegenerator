-- Run this after 002_storage_and_defaults.sql.
-- Splits the header into a fixed-feeling "project title" (top-left, big —
-- e.g. "The Recording Studio") separate from the artist's own name (now
-- shown top-right). Existing rows automatically get the default value.

alter table artists
  add column if not exists project_title text not null default 'The Recording Studio';
