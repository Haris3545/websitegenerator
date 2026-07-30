-- Run this after 037_gate_darkness_grain.sql.
-- Backs the Dashboard's "Campaign timeline" widget: a lightweight, freeform
-- list of dated milestones rendered as evenly-spaced dots along a single
-- line (see CampaignTimeline.tsx). Deliberately its own table rather than
-- reusing artist_events or board_items — this is a simple point-in-time
-- ticker independent of the Calendar tab's Tease/Release/Sustain campaign
-- blocks (which have their own start/end date range, see board_items'
-- campaign_start_date/campaign_end_date columns).

create table if not exists campaign_milestones (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists (id) on delete cascade,
  label text not null,
  milestone_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists campaign_milestones_artist_id_idx
  on campaign_milestones (artist_id, milestone_date);
