-- Run this after 030_published_deployment_id.sql.
-- Adds description + image fields for manually-added Calendar events (see
-- the "+ Add event" flow in MonthCalendar.tsx / addManualEvent in
-- src/app/s/[slug]/actions.ts). Ticketmaster/web-search events leave both
-- null.

alter table artist_events
  add column if not exists description text,
  add column if not exists image_url text;
