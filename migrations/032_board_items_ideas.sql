-- Run this after 031_manual_events.sql.
-- Extends board_items with everything the swipeable Ideas tab needs: an
-- image, a like/pass/pending status (the swipe outcome), an optional
-- timeline/lead-time note, and "add to calendar" scheduling. Strategy/
-- Tactics/Research keep using the plain title+body shape (BoardList.tsx) and
-- simply leave these columns at their defaults/null.

alter table board_items
  add column if not exists image_url text,
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'liked', 'disliked')),
  add column if not exists timeline text,
  add column if not exists calendar_status text
    check (calendar_status in ('confirmed', 'tbc')),
  add column if not exists scheduled_date date,
  add column if not exists scheduled_time time,
  add column if not exists calendar_event_id uuid references artist_events (id) on delete set null;

create index if not exists board_items_status_idx on board_items (artist_id, board_key, status);
