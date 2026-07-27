-- Rich fields for the Tactics board specifically. board_items is shared
-- across Strategy/Tactics/Ideas/Research (see 009_board_items.sql and
-- 032_board_items_ideas.sql), so these are additive/nullable columns —
-- Strategy/Research keep using the plain title+body shape and simply leave
-- everything below at its default/null, same as they already do with the
-- Ideas-only columns from 032.
alter table board_items
  add column if not exists channel text
    check (channel is null or channel in ('Social', 'OOH', 'PPC', 'Audio', 'Video', 'Experiential')),
  add column if not exists pillar text
    check (pillar is null or pillar in ('tease', 'launch', 'sustain')),
  add column if not exists tactic_status text
    check (tactic_status is null or tactic_status in ('planned', 'approved', 'booked', 'archived')),
  add column if not exists objective text,
  add column if not exists kpi text,
  add column if not exists role_in_mix text,
  add column if not exists audience text[] not null default '{}',
  add column if not exists audience_detail text,
  add column if not exists format text,
  add column if not exists phase text,
  add column if not exists budget text,
  add column if not exists campaign_start_date date,
  add column if not exists campaign_end_date date;
