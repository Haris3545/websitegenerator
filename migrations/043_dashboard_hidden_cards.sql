-- Run this after 042_board_items_soft_delete.sql.
-- Previously, removing a KPI card from the Dashboard ("×") reused
-- updateTabOrder and just filtered the tab out of enabled_tabs — which
-- means deleting a KPI card also removed that tab from the nav bar
-- entirely. This column decouples the two: card removal now only ever
-- writes here, leaving enabled_tabs (and the nav pills) untouched.

alter table artists
  add column if not exists dashboard_hidden_cards jsonb not null default '[]'::jsonb;
