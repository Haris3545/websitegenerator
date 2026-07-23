-- Run this after 001_init.sql. Fixes background/video uploads failing with
-- "new row violates row-level security policy" (storage.objects has RLS
-- enabled by default with no policies — the bucket's "public" toggle only
-- affects downloads, not uploads) and updates the default tagline.

create policy "artist_media_admin_write" on storage.objects
  for all
  using (bucket_id = 'artist-media' and is_builder_admin())
  with check (bucket_id = 'artist-media' and is_builder_admin());

create policy "artist_media_public_read" on storage.objects
  for select
  using (bucket_id = 'artist-media');

alter table artists alter column tagline set default 'VCCP Cultural Intelligence';
