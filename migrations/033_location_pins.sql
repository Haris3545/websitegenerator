-- Run this after 032_board_items_ideas.sql.
-- Custom map pins for the Locations tab's 2D map (separate from the
-- Ticketmaster/web-search tour dates that already drive the 3D globe +
-- event list) — freeform points an artist's team adds themselves, each with
-- its own label and colour, filterable from the map's top bar.

create table if not exists location_pins (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists (id) on delete cascade,
  label text not null,
  color text not null default '#eab308',
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);

create index if not exists location_pins_artist_id_idx on location_pins (artist_id);
