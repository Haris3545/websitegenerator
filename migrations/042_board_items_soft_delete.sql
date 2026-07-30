-- Run this after 041_discussion_replies.sql.
-- Lets Strategy/Tactics/Research cards (board_items rows for those three
-- board_keys) be restored after deleting them, instead of the delete being
-- permanent. deleteBoardItem now just stamps deleted_at instead of removing
-- the row; restoreBoardItem clears it back to null. Every board_items query
-- that lists "live" cards (or counts them) filters deleted_at is null so a
-- soft-deleted row disappears everywhere it would otherwise show up
-- (Strategy/Research tabs, the Tactics tab, the Calendar tab's Gantt, and
-- the Dashboard's KPI counts, since Tactics rows double as Gantt blocks).

alter table board_items
  add column if not exists deleted_at timestamptz;

create index if not exists board_items_deleted_at_idx
  on board_items (artist_id, board_key, deleted_at);
