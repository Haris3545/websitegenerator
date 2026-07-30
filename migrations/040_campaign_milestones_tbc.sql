-- Run this after 039_discussion.sql.
-- Extends campaign_milestones with an optional description, and support
-- for "date TBC" milestones that sit at an explicit position on the
-- timeline instead of a real calendar date (dragged into place, or set via
-- "this goes between X and Y" in the edit view) — see CampaignTimeline.tsx.
--
-- sort_order is what actually determines a milestone's position on the
-- line now, for every milestone, dated or not: a dated milestone's
-- sort_order is just its date's epoch seconds (so chronological order
-- falls out for free), while a TBC milestone's sort_order is an arbitrary
-- float chosen at creation/drag/reposition time so it can sit anywhere
-- between two neighbours without needing a real date at all.

alter table campaign_milestones
  alter column milestone_date drop not null,
  add column if not exists description text,
  add column if not exists is_tbc boolean not null default false,
  add column if not exists sort_order double precision;

update campaign_milestones
  set sort_order = extract(epoch from milestone_date)
  where sort_order is null and milestone_date is not null;

alter table campaign_milestones alter column sort_order set not null;
