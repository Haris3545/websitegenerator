-- Run this after 040_campaign_milestones_tbc.sql.
-- Adds one level of reply threading to the Discussion section: a reply is
-- just another discussion_posts row with parent_id set to the post it's
-- replying to. Null parent_id (the existing default for every row created
-- before this migration) means a top-level post.

alter table discussion_posts
  add column if not exists parent_id uuid references discussion_posts (id) on delete cascade;

create index if not exists discussion_posts_parent_id_idx on discussion_posts (parent_id);
