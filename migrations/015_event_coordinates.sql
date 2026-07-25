-- Run this after 014_drop_landing_video_url.sql.
-- Backs the Locations tab's globe view — real coordinates per event, so
-- shows can be plotted directly rather than geocoded on every render.
-- Ticketmaster events come with coordinates already; web-search-found
-- events (see events.ts) are geocoded once at fetch time via Open-Meteo.

alter table artist_events
  add column if not exists latitude numeric,
  add column if not exists longitude numeric;
