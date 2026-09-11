-- New optional field on the Facebook "Context note" intervention type:
-- appends "with diverse viewpoints" to the existing "The context was rated
-- as helpful by <group>" sentence (RatedByLine, components-ui-
-- interventions.jsx) — mirrors real X Community Notes' own "rated helpful
-- by people from different points of view" framing, as an admin-
-- configurable toggle rather than requiring it to be hand-typed into the
-- free-text "contributor group type" field every time. Purely additive;
-- every existing post defaults to false (unchanged rendered sentence).
alter table public.posts add column if not exists note_diverse_viewpoints boolean not null default false;
