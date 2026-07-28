-- The password gate page's darkness overlay and grain were previously a
-- hardcoded 55% scrim plus the dashboard's own shared grain_intensity/
-- grain_monochrome (aesthetic_params, meant for the main dashboard
-- background) — giving the gate page no independent control of its own.
-- Mirrors the existing gate_background_url / background_image_url split:
-- the gate page gets its own values here instead of reusing the
-- dashboard's.
alter table artists
  add column if not exists gate_scrim_opacity numeric not null default 0.55,
  add column if not exists gate_grain_intensity numeric not null default 0,
  add column if not exists gate_grain_monochrome boolean not null default false;
