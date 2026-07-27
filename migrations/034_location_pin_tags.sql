-- Run this after 033_location_pins.sql.
-- Reworks location_pins from a single label (used as both the pin's own
-- name and its filter grouping) into a proper name + reusable tags model:
-- a pin gets its own name, plus any number of tags drawn from a per-artist
-- tag list that can be created/renamed/deleted independently of any one
-- pin (see LocationPinMap.tsx).

alter table location_pins rename column label to name;

alter table location_pins
  add column if not exists tag_ids uuid[] not null default '{}';

create table if not exists location_pin_tags (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists (id) on delete cascade,
  name text not null,
  color text not null default '#eab308',
  created_at timestamptz not null default now()
);

create index if not exists location_pin_tags_artist_id_idx on location_pin_tags (artist_id);
