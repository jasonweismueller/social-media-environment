-- Fixes discovered by checking a real (isolated copy) Code.gs deployment
-- against the Phase 1 schema during Phase 3, 2026-08-02 — see
-- supabase/README.md "Phase 3" for the full story. Additive: projects/posts
-- from migrations 3/4 have no rows yet (Phase 3 hadn't reached --apply),
-- so these are plain column changes, not data-preserving migrations.

alter table public.projects add column notes text;

-- `image`/`video` on a real post are not plain URLs — they're objects
-- ({url, alt, svg}, etc.) when the post uses a generated/randomized
-- placeholder rather than an uploaded file. JSONB already holds every other
-- flexible post field (reactions/metrics/note_reader_groups) — image/video
-- belong in that group too, not `text`. to_jsonb(text) handles both a NULL
-- column and any pre-existing plain-string value safely.
alter table public.posts alter column image type jsonb using to_jsonb(image);
alter table public.posts alter column video type jsonb using to_jsonb(video);

-- Fields seen on real posts that weren't in the original field inventory
-- (reconstructed from admin editor components, not live data): `images`
-- (plural — likely the multi-image/carousel feature CLAUDE.md mentions for
-- the Instagram post editor), `imageTopic` (a second, image-pool-specific
-- topic distinct from the post's own `topic`), and `showGhostComments`.
alter table public.posts add column images jsonb not null default '[]'::jsonb;
alter table public.posts add column image_topic text;
alter table public.posts add column show_ghost_comments boolean not null default false;
