-- Run this after 022_dashboard_section_order.sql.
-- Tracks how many Gemini requests the app has made today so
-- generateContentThrottled (see src/lib/gemini.ts) can fail fast with a
-- clear, catchable error once the free tier's 20-requests/day cap is
-- close, instead of every feature separately discovering it via a raw 429.

create table if not exists gemini_usage (
  usage_date date primary key,
  request_count integer not null default 0
);

alter table gemini_usage enable row level security;
-- No policies: only the service-role client (which bypasses RLS) ever
-- touches this table — it's an internal rate-limit counter, not
-- artist-scoped data a builder admin or artist member needs to see.
