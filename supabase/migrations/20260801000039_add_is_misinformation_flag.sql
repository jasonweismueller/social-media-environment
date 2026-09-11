-- Adds a per-post "misinformation" flag. Purely additive: every existing
-- post defaults to false, so this is a no-op for anything already saved.
--
-- Consumed by the frontend's avatar-randomization pipeline
-- (getAvatarPoolForPost, src/utils/utils-core.js) to draw a misinformation-
-- flagged post's randomized avatar from a dedicated
-- avatars/misinformation/{female,male}/ pool instead of the plain
-- avatars/{female,male}/ pool every other post uses.
alter table public.posts
  add column if not exists is_misinformation boolean not null default false;
