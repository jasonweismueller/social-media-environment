-- Adds a per-post "AI-generated profile" flag (Instagram). Purely additive:
-- every existing post defaults to false, so this is a no-op for anything
-- already saved.
--
-- When set, the Instagram post card shows an "AI-generated profile" label
-- under the author's name and the author's bio card/sheet shows the same
-- label above the bio text, matching real Instagram's AI-profile labelling.
alter table public.posts
  add column if not exists ai_generated boolean not null default false;
