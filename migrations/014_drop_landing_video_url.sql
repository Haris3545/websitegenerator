-- Run this after 013_music_stats.sql.
-- "Landing page media" and "Password page background" turned out to be the
-- same thing (the gate page background) described two different ways —
-- landing_video_url had actually been wired up as the main site's
-- background override this whole time, which is the bug where a landing
-- video took over the dashboard background instead of staying on the
-- password page. Folding it away: wherever it was set, that's what was
-- actually showing as the background before this fix, so it moves into
-- background_image_url to preserve the current look, then the column goes.

update artists
set background_image_url = coalesce(landing_video_url, background_image_url)
where landing_video_url is not null;

alter table artists drop column if exists landing_video_url;
