-- Adds a per-post list of feed-wide randomizations to SKIP for that post.
-- Purely additive: every existing post defaults to an empty list, so nothing
-- already saved changes behaviour.
--
-- Values are any of: 'time', 'avatar', 'name', 'image', 'bio' — the same five
-- feed-level randomize_* flags. A post listing e.g. 'avatar' keeps its own
-- stored avatar even when the feed has "Randomize avatars" turned on; the
-- feed-level switch itself is untouched and still applies to every other post.
alter table public.posts
  add column if not exists randomize_exclude jsonb not null default '[]'::jsonb;
