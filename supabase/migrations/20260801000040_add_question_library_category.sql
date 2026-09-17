-- Question library items get an organizational "category" so the picker
-- modal can group/label them (Mediator / Dependent Variable / Demographic /
-- Other) instead of one flat list — per direct admin feedback that the
-- library was becoming hard to scan as it grew. Plain free text, not an
-- enum/check constraint: the four values above are enforced client-side via
-- a <select> (components-admin-question-library.jsx's LIBRARY_ITEM_CATEGORIES),
-- deliberately left unconstrained at the DB level so a future category can
-- be added without a migration, same reasoning most other free-text
-- classification columns in this schema already use. Existing items default
-- to 'other' — additive, no backfill decision needed since "other" is
-- already the correct bucket for "not yet categorized".
alter table public.question_library_items
  add column category text not null default 'other';
