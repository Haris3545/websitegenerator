-- Lets a background (the main dashboard, and separately the password gate
-- page) be a short looping clip from a YouTube video instead of an uploaded
-- image/video file. Kept as separate columns rather than repurposing
-- background_image_url/gate_background_url, since those are read by
-- sniffing the URL's file extension to decide image-vs-video — a YouTube
-- reference has no such extension, and this is checked first (see
-- getSiteArtist.ts / gate/page.tsx consumers), falling back to the
-- existing url-based logic when null.
alter table artists
  add column if not exists background_youtube_id text,
  add column if not exists background_youtube_start numeric not null default 0,
  add column if not exists background_youtube_end numeric,
  add column if not exists gate_youtube_id text,
  add column if not exists gate_youtube_start numeric not null default 0,
  add column if not exists gate_youtube_end numeric;
