-- Adds a fourth posts.author_type value, 'random', for the new per-post
-- "randomize gender" Author Type option (distinct from the feed-wide
-- randomize_avatars/randomize_names flags, which only randomize *which*
-- name/avatar within a fixed gender — this randomizes the gender itself,
-- per post, per participant). See resolvePostAuthorType (utils-core.js)
-- for the deterministic resolution logic.
--
-- Same shape as 20260801000014_fix_ad_type_check.sql — posts.author_type's
-- check constraint only allowed ('female', 'male', 'company'); without this,
-- saving a post with the new Author Type option selected in the admin
-- editor would fail on insert/update.

alter table public.posts drop constraint posts_author_type_check;
alter table public.posts add constraint posts_author_type_check
  check (author_type in ('female', 'male', 'company', 'random'));
