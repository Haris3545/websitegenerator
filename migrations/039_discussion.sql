-- Run this after 038_campaign_milestones.sql.
-- Backs the new Discussion section on the Dashboard: anyone past the
-- artist's password gate can post, react, and reply — there's no real
-- per-visitor login on this site (see verifyArtistAccess in
-- s/[slug]/actions.ts), so "author_name" is just a display name typed once
-- and remembered in that browser's localStorage, not an authenticated
-- identity. Reactions are keyed by (post_id, author_name, kind) so the
-- same person clicking the same reaction twice toggles it off instead of
-- stacking duplicates — this is a courtesy against accidental double-clicks
-- and impersonation-proofing was never the goal here, matching the rest of
-- this site's shared-password security model.

create table if not exists discussion_posts (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists (id) on delete cascade,
  author_name text not null,
  body text not null default '',
  image_url text,
  gif_url text,
  created_at timestamptz not null default now()
);

create index if not exists discussion_posts_artist_id_idx
  on discussion_posts (artist_id, created_at);

create table if not exists discussion_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references discussion_posts (id) on delete cascade,
  author_name text not null,
  kind text not null,
  created_at timestamptz not null default now(),
  unique (post_id, author_name, kind)
);

create index if not exists discussion_reactions_post_id_idx
  on discussion_reactions (post_id);
