# Supabase migration — Phase 1 (schema design)

Status: **schema drafted, nothing applied.** No Supabase project exists yet. This SQL has never
run against a database. See `~/.claude/plans/gradual-migrating-codd.md` for the full 7-phase plan
and `CLAUDE.md` ("Backend migration planning") for why this migration is happening at all.

This directory is currently inert — nothing in the app references it. Per the plan's safety
approach, that stays true through Phase 4: the Supabase integration gets built behind a
`VITE_BACKEND` flag that defaults to the current Google Apps Script backend, so none of this
becomes live behavior until the flag is deliberately flipped in a later phase.

## What's here

`migrations/`, one file per entity group, applied in filename order:

1. `20260801000001_extensions_and_helpers.sql` — `pgcrypto`, an `updated_at` trigger function,
   and role-check helper functions (`is_admin_writer()`, `is_admin_reader()`, `is_owner()`) used
   by every RLS policy below.
2. `20260801000002_profiles.sql` — admin accounts. Extends Supabase Auth's `auth.users` with
   `role`/`disabled`, auto-populated via an `on_auth_user_created` trigger.
3. `20260801000003_projects_and_feeds.sql` — `projects`, `feeds` (with a `flags` JSONB column for
   the randomize_* toggles).
4. `20260801000004_posts.sql` — one row per post, FK'd to `feeds`, replacing the current
   one-JSON-blob-per-feed sheet.
5. `20260801000005_surveys_and_feed_surveys.sql` — `surveys` (whole survey definition as one
   `definition` JSONB column — pages/page_blocks/experiment_groups/questions all included, no
   chunking needed since Postgres JSONB has no 50KB-per-cell limit) and `feed_surveys` (link
   table, replacing the `FeedSurveys` sheet).
6. `20260801000006_participants.sql` — fixed core columns (session/prolific/timing) plus an
   `extra` JSONB column for the ~20 per-post dynamic interaction fields
   (`${postId}_reacted`/`_commented`/`_review_rating`/etc.) that currently get appended as new
   sheet columns per post.
7. `20260801000007_survey_responses.sql` — one row per submission, `responses` JSONB holds
   `{question_id: answer}` exactly like the current backend payload shape.
8. `20260801000008_experiment_assignments.sql` — round-robin group assignment as a
   `SECURITY DEFINER` Postgres function (`assign_experiment_group`) using `SELECT ... FOR UPDATE`
   row locking instead of `LockService` + a `PropertiesService` counter. Idempotent per
   `(survey_id, session_id)`, same guarantee the current implementation makes. The two backing
   tables have **no** public insert/update policies — the RPC function is the only sanctioned
   write path (see the comment at the top of that file for why).

## Design decisions worth knowing before touching this again

- **Primary keys are `text`, not `uuid`.** The current GAS backend already generates opaque
  string ids for project/feed/survey/post, and those exact strings are embedded outside the
  database — launch links in the admin UI, CSV column headers, and the `postNames` localStorage
  map (keyed by post id). Phase 3's data-migration script needs to carry the existing id strings
  over unchanged, not mint new ones. New tables with no Sheets analog (`participants`,
  `survey_responses`, `experiment_assignments`, the link tables) use a generated `uuid` since
  there's no legacy id to preserve.
- **JSONB stays JSONB where the current data already is a blob**: `feeds.flags`,
  `surveys.definition`, `posts.reactions`/`metrics`/`note_reader_groups`,
  `survey_responses.responses`, `participants.extra`. This keeps Phase 2's port of
  `sanitizeSurveyDef_` and friends close to line-for-line, per the plan, rather than forcing a
  data-model redesign as part of a storage-layer swap.
- **RLS is public-read / admin-write for participant-facing tables** (`feeds`, `posts`,
  `surveys`, `feed_surveys`) since participants load a study anonymously today, with no auth step
  before the feed/survey renders. `participants` and `survey_responses` are public-*insert*-only
  (a participant submits once) and admin-read. `projects`, `profiles`,
  `experiment_group_counters`, and `experiment_assignments` are admin-only in both directions
  (the last two only writable via the RPC functions, not even for admins).
- Field lists for every table were pulled from the actual frontend code that constructs these
  objects (editor components, `utils-survey.js`, `utils-backend.js` payload builders), not
  guessed from the plan's high-level entity table.

## What Phase 1 deliberately leaves out

- No Supabase project exists to run these against yet. Creating one and running
  `supabase db push` (or pasting these files into the SQL editor in order) is the first step of
  whatever session picks up Phase 2.
- `sanitizeSurveyDef_` and the other Code.gs validation logic are **not** ported here — that's
  Phase 2 (Edge Functions), deliberately kept separate from schema design.
- No data migration script yet — that's Phase 3, and needs a Supabase project + this schema
  applied before it can be written against a real target.
- `upload_video` (currently Drive-based) is untouched; whether to move it to S3 alongside images
  is still an open question for the user to confirm, not decided here.
- Storage bucket / RLS policies for file uploads aren't covered — the plan notes images already
  go through a separate S3 signer, out of scope for this schema.

## Next step

Confirm with the user (open questions from the plan file, still unconfirmed):
Supabase Auth vs. a custom token scheme (this schema assumes Supabase Auth), and Supabase project
region. Then create the Supabase project, apply these migrations, and move to Phase 2 (porting
`sanitizeSurveyDef_` and friends into Edge Functions).
