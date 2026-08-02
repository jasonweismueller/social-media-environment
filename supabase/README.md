# Supabase migration — Phase 1 (schema) + Phase 2 (business logic) + Phase 3 (data migration) + Phase 4 (frontend wiring)

Status: **Phases 1–3 complete and verified against real production data, 2026-08-02. Phase 4
(frontend wiring) is now substantially done and tested as of 2026-08-02 too** — see "Phase 4 —
frontend wiring" below for what's ported, what's left, a real bug found and fixed in the deployed
`save-survey` Edge Function, and how it was verified (disposable test data + an actual UI
walkthrough as a participant, not just direct function calls). Full narrative detail on Phase 4
lives in `CLAUDE.md` ("Backend migration" section) rather than duplicated here, matching how
Phases 1–3 are written up in this file and only pointed to from CLAUDE.md.

A real Supabase project exists, all 11 migrations are applied, `save-survey` is deployed (and was
patched once during Phase 4 — see below), and `migrate-from-sheets.mjs` has successfully run
`--apply` against an isolated copy of the real study spreadsheet — all 7 real projects (56 feeds,
474 posts, 730 participants, 36 surveys, 849 survey responses) are now correctly in Supabase. See
"How Phase 3 was verified" below for the two real bugs this surfaced (both fixed) and exactly
what's still unverified. See `~/.claude/plans/gradual-migrating-codd.md` for the full 7-phase plan
and `CLAUDE.md` ("Backend migration planning") for why this migration is happening at all.

**This directory is no longer inert** — `src/utils/utils-backend-supabase.js` and `src/utils/
utils-supabase-client.js` (new, Phase 4) reference it directly, though only when
`VITE_BACKEND=supabase` is explicitly set (default stays `gas`), so production behavior hasn't
changed. Real participants have been served by the unchanged Apps Script backend throughout.

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
9. `20260801000009_phase3_field_fixes.sql` — additive fixes found by checking a real deployment
   during Phase 3 (see below): adds `projects.notes`, converts `posts.image`/`posts.video` to
   `jsonb` (a real post's image/video can be an object, not a plain URL), and adds
   `posts.images`/`posts.image_topic`/`posts.show_ghost_comments`, none of which were in the
   original field inventory.
10. `20260801000010_fix_table_grants.sql` — grants `SELECT`/`INSERT`/`UPDATE`/`DELETE` on every
    table to `anon`/`authenticated`/`service_role`. Every RLS policy in this migration set assumed
    the standard Supabase convention (base table grants wide open, RLS as the actual narrowing
    layer) — that base grant was never actually present on this project, surfacing as a hard
    `permission denied for table` error on the first real `--apply`, even for `service_role` (RLS
    bypass doesn't skip this separate, lower-level grant check). Safe: RLS stays enabled and
    unchanged on every table, so this only unblocks the policies that were already written to sit
    behind it.
11. `20260801000011_fix_feed_id_collisions.sql` — the one real data-correctness bug found during
    Phase 3 (see below): `feeds.id` needed to become a synthetic `<project_id>::<app>::<feed_id>`
    key instead of the bare `feed_id` string, and `survey_responses.feed_id`'s foreign key needed
    dropping. Truncates every Phase 3-migrated table (`projects`/`profiles` untouched) since this
    ran after a first `--apply` had already silently corrupted `feeds` under the old schema.

## Phase 2 — business logic

`functions/`:

- `save-survey/index.ts` — ports Code.gs's `sanitizeSurveyDef_`/`handleSaveSurvey_`
  (`survey_create`/`survey_update`). Verifies the caller's Supabase Auth JWT, looks up their
  `profiles` role via the service-role client (editor/owner required, same gate as
  `requireRole_(session, ['editor'])` today), runs the submitted definition through the sanitize
  pipeline below, upserts `surveys`, and re-derives `feed_surveys` link rows from
  `feed_sequence_ids` (delete-then-reinsert, matching `handleSaveSurvey_`'s "link every feed in
  feed_sequence_ids" behavior).
- `_shared/survey-sanitize.ts` — a manual Deno port of `src/utils/utils-survey.js`'s
  normalization pipeline: `normalizeSurvey`, `frontendSurveyToBackend`, `reconcilePageBlocks`,
  `normalizeQuestion`, `normalizeExperimentGroups`, and every helper they call (~850 lines).
  Deliberately ports the *frontend's* pipeline rather than guessing at Code.gs's implementation,
  since Code.gs isn't in this repo and can't be read — `frontendSurveyToBackend`'s output already
  **is** the canonical sanitized shape (Code.gs's copy is a defensive second pass over the same
  shape, one of the "4 places" CLAUDE.md already flags as duplicated). Running it server-side
  closes the gap that mattered: today an admin browser could send an unsanitized definition
  straight to a Postgres RLS-gated upsert with no shape validation at all; this function is that
  validation gate.
- `_shared/cors.ts` — preflight/headers boilerplate, shared by any future admin-facing function.

**Deviation from the plan's Phase 2 wording, worth flagging explicitly**: the plan said to port
*"round-robin experiment group assignment"* into an Edge Function too. That was already built in
Phase 1 instead, as the Postgres `assign_experiment_group()` function (see
`migrations/20260801000008_experiment_assignments.sql`) — a `SELECT ... FOR UPDATE`-locked
function living in the database is strictly better here than an Edge Function calling back into
Postgres for the same lock over an extra network hop, so it wasn't duplicated as an Edge Function
too. Nothing further needed for that half of Phase 2's scope.

### How Phase 2 was verified

No Supabase project exists to deploy `save-survey` against, so it couldn't be exercised
end-to-end. Two things *could* be checked from this environment, both actually run (not just
read):

1. `deno check` against every new file, including `save-survey/index.ts` against the real
   `@supabase/supabase-js@2` types pulled from esm.sh — confirms the Supabase client calls
   (`auth.getUser`, `.from().upsert().select().single()`, etc.) are used correctly, not just that
   the syntax parses.
2. The sanitize port was run side-by-side against the real `src/utils/utils-survey.js` — copied
   both into a scratch dir, fed identical fixture survey objects (covering duplicate/invalid page
   IDs, duplicate/missing experiment-group IDs, stale `visible_to_group_ids` references, six
   question types, and the legacy flat-`questions`-with-embedded-`page_break` path) into
   `normalizeSurvey`/`frontendSurveyToBackend` on both sides — one run under Node against the real
   file, one under Deno against the ported file — and diffed the JSON output. **Byte-for-byte
   identical on both fixtures.** This is the strongest verification available without a deployed
   environment, but it's still fixture coverage, not exhaustive — Phase 4's live click-through
   (once this is actually wired to a UI) is the real backstop, same as everywhere else in this
   migration.

One incidental finding from building that fixture, not fixed here since it's existing frontend
behavior and out of scope for a straight port: mixing a top-level `pages` array with a
`page_break`-type question embedded inside one of those pages' `questions` (rather than the two
input shapes the editor actually produces — clean `pages` with no embedded breaks, or a flat
legacy `questions` list) can make `coerceQuestionsIntoPages` mint duplicate page ids, which then
makes `reconcilePageBlocks` silently drop the second page's block assignment. Doesn't affect this
port's fidelity — it reproduced the exact same (mis)behavior as the real frontend, which is the
correct outcome for a port — but worth knowing if a future session ever sees pages "disappearing"
from `page_blocks` for a survey with that unusual input shape.

## Phase 3 — data migration script

`scripts/` (a separate Node package — not part of the main app's `package.json`/build, since it's
a one-off admin tool the user runs from their own machine, never shipped):

- `migrate-from-sheets.mjs` — reads everything out of an isolated copy of the study spreadsheet
  and writes it into Supabase.
- `survey-sanitize.mjs` — **a verbatim copy** of `src/utils/utils-survey.js` (not a re-port —
  the full file, copied byte-for-byte apart from inlining `uid()` so it doesn't need to import
  `utils-core.js`, which has browser-only `window` references elsewhere in that file that would
  break under plain Node). Used so survey definitions land in the exact same shape a fresh save
  through `save-survey` would produce, with zero transcription risk — a copy can't drift from the
  thing it's a copy of the way a second hand-written port could.
- `package.json` — only dependency is `@supabase/supabase-js`.

### Extraction strategy — a deliberate change from the plan's original wording

The plan said to read the copied spreadsheet directly "via `googleapis`" (the raw Sheets API).
This script does not do that. Instead it calls the same `GS_ENDPOINT?path=...` GET query API the
admin dashboard already calls for every read (`path=projects`, `feeds`, `posts`, `participants`,
`surveys`, `survey_definition`, `survey_responses_by_survey`, `get_feed_flags` — all confirmed by
reading the `*_GET_URL` constants and their call sites in `src/utils/utils-backend.js`), pointed
at a **redeployed copy** of the Apps Script project rather than production.

Why the switch: Code.gs isn't in this repo, so the exact on-sheet format for the one genuinely
complex piece — `SurveyDefs::{project}::{survey}`'s chunked-JSON-across-rows encoding (see
CLAUDE.md, the 50,000-char/cell workaround) — can't be read directly; reimplementing that chunk
format from a guess would be the riskiest part of this whole migration to get wrong. The
`path=survey_definition` endpoint already does that reconstruction correctly, because it's the
same code path the live app depends on every day. Calling it against an isolated copy is exactly
as safe as reading raw cells from that same copy would have been (see "Safety model" below) —
this is a strictly more-reliable path to the same data, not a safety tradeoff.

One consequence worth knowing: this means the script needs a valid admin login (email + password,
or a pre-obtained `admin_token`) against the copy, since most of these read paths are
admin-gated (`requireRole_`-equivalent) the same way they are in production. `path=projects`,
`path=feeds`, and `path=posts` are not admin-gated (participants load these anonymously today, so
they're already public reads — matches this schema's own public-read RLS design).

### Safety model (same rule as the plan states — do not deviate without re-confirming)

1. **File → Make a copy** of the live study spreadsheet in Google Sheets. Google Sheets copies
   the bound Apps Script project along with it, so the copy has its own independent Code.gs.
2. Open the **copy's** Apps Script editor (Extensions → Apps Script) and deploy it as its own
   **new** web app (Deploy → New deployment). This produces a brand-new `/exec` URL, completely
   separate from the production `GS_ENDPOINT` — reads against it can never touch live data or add
   load to the deployment real participants are using.
3. Point this script's `GS_ENDPOINT` env var at that new URL, never the production one.

### What's migrated vs. not

| Sheets entity | Migrated how |
|---|---|
| Projects, Feeds (+flags), Posts, Participants | `path=projects`/`feeds`/`get_feed_flags`/`posts`/`participants`, mapped field-by-field to the Phase 1 schema |
| Surveys (definition, page_blocks, experiment_groups, questions) | `path=survey_definition`, run through the same `normalizeSurvey`/`frontendSurveyToBackend` pipeline `save-survey` uses |
| FeedSurveys links | derived from the migrated survey's `feed_sequence_ids`, same as `save-survey` does |
| SurveyResponses | `path=survey_responses_by_survey` |
| ExperimentAssignments | **derived from SurveyResponses rows**, not read from a raw `ExperimentAssignments` sheet — every completed response already carries the `experiment_group_id` it was assigned (CLAUDE.md, "Experiment group missing from survey CSV export"). Accepted gap: a participant who was assigned a group but never completed the survey won't appear, since only completed-response rows are visited. `experiment_group_counters` gets seeded to each survey's migrated assignment count so the round-robin continues sensibly post-cutover, not from zero. |
| **Admins** | **Not migrated — by design, not an oversight.** There's no read API for the Admins sheet (it holds password salts/hashes, and exposing it would be a real credential leak), and a hash from Code.gs's custom scheme couldn't be carried into Supabase Auth's own hashing even if it were readable. The script prints a reminder at the end to recreate accounts by hand in Supabase Auth and set their `profiles.role`. |

### Idempotency

Every write is an upsert, keyed on each table's real primary key. `projects`/`feeds`/`posts`/
`surveys` already have stable ids from Code.gs; `feed_surveys`/`experiment_assignments` have real
unique constraints from Phase 1. `participants` and `survey_responses` have no natural id from
the roster reads, so the script derives one deterministically (`sha256(kind::feed_id::session_id)`
-shaped into a UUID) rather than letting Postgres mint a random one — otherwise a second run
(which the plan explicitly calls for: once against test data, once for real before cutover) would
duplicate every row instead of updating them in place. Verified by running the script's mock
harness twice in a row and confirming an identical `participants.id`/`survey_responses.id` both
times (see "How Phase 3 was verified").

Defaults to a dry run (logs planned upserts, writes nothing) — pass `--apply` or `APPLY=1` to
actually write.

### How Phase 3 was verified

No Supabase project or copied spreadsheet exists to run this against for real. What was actually
run, not just read:

1. `node --check` on both `.mjs` files.
2. `npm install` inside `supabase/scripts/` in isolation (separate from the main app's
   dependencies) — confirmed it installs cleanly in this sandbox.
3. A full mocked end-to-end run: `global.fetch` stubbed to answer every `GS_ENDPOINT?path=...`
   call with fixture JSON (a post exercising most of the Facebook post schema, a participant row
   with dynamic per-post columns, a survey with an experiment group, a matching response), and to
   capture (rather than actually send) every Supabase REST call so the exact row payloads could be
   inspected. Confirmed field-by-field: post camelCase fields map to the right snake_case columns,
   unknown participant columns land in `extra` rather than being dropped, the survey definition
   written matches what `save-survey` would produce, and `experiment_group_counters` gets seeded
   correctly from the derived assignment count. Ran the harness twice to confirm deterministic ids
   repeat exactly (the idempotency fix above was caught this way, not written correctly the first
   time — the initial version used a bare `.insert()` for participants and an `upsert` with no id
   in the payload for survey_responses, which would have silently duplicated every row on a second
   run).

This is real verification of the script's logic, but at the time it was written it could not
verify the one thing that mattered most: whether the *actual* shape of data returned by a real
Code.gs deployment matches the shapes this script assumed (inferred from `utils-backend.js`'s
consumption of these same endpoints, not from ever seeing a live response).

**Update, 2026-08-02 — checked against a real deployment, and it caught real bugs.** Once the
Supabase project existed and the spreadsheet copy was deployed (see "Safety model" above), a few
direct `curl` calls against `path=projects`, `path=feeds`, and `path=posts` on the real isolated
copy — before running the migration script itself — turned up several gaps between the assumed
and actual shapes, captured as migration `20260801000009_phase3_field_fixes.sql`:

- `feeds.flags` comes back as a **JSON string** (`"{\"randomize_times\":true,...}"`), not a
  pre-parsed object, and empty-string when unset. The script used to make a separate
  `get_feed_flags` call per feed instead of using this — removed; parsing the embedded string is
  both simpler and one fewer HTTP call per feed.
- A real post's `image`/`video` fields are **objects** (`{url, alt, svg}`) when the post uses a
  generated/randomized placeholder rather than an uploaded file — not plain URL strings, which is
  what the original field inventory (built from admin editor components, not live data) assumed.
  The `posts.image`/`posts.video` columns were `text`; migration 0009 converts them to `jsonb`.
  This one would have hard-failed on the first real `--apply`, not just silently mismapped.
- Three post fields never appeared anywhere in the original inventory at all: `images` (plural —
  likely the multi-image/carousel feature CLAUDE.md mentions for the Instagram editor),
  `imageTopic` (a second, image-pool-specific topic distinct from the post's own `topic`), and
  `showGhostComments`. Added as new columns.
- `projects` rows also carry `notes`, `created_at`, and `updated_at` that the script was silently
  dropping (`created_at`/`updated_at` would have just defaulted to migration time instead of the
  true historical dates).

The post/project fields being silently dropped is the more important lesson than the `image`/
`video` type mismatch: a dry run only logs row *counts*, so none of these would have shown up as
an error or a warning — only inspecting real field-by-field output caught them. **The lesson for
any future session extending this script**: don't trust the dry run's summary counts alone as
"verified" — diff a few real rows against what the admin dashboard shows for the same
feed/project, the same way this check did.

**Update, 2026-08-02 — full `--apply` run against real data, one serious bug found and fixed.**
Once a real admin login was available, the script ran end to end against all 7 real projects.
First `--apply` attempt surfaced two problems, in order:

1. **`permission denied for table projects`** on the very first write. Not an RLS issue (RLS
   policy violations produce a different, more specific error) — a plain grant-level ACL check,
   failing even for `service_role`. Root cause and fix: `20260801000010_fix_table_grants.sql`
   above.
2. **After fixing that, the run completed with zero errors — but silently wrong.** `feed_1`,
   `feed_2`, etc. exist as real, distinct feeds inside *multiple different projects*
   simultaneously (confirmed directly: `feed_1` is a genuinely different feed under `project_1`,
   `proj_2`, and `proj_3`). `feeds.id` was a bare `text primary key`, an assumption copied from
   project_id/survey_id/post_id (which really are globally unique) without checking whether
   feed_id was too. It isn't — real feed_ids are simple per-(project, app) counters. Every
   project's `upsert` after the first silently **overwrote** the previous project's identically-
   named feed row (upsert treats a primary-key collision as an update, not a conflict — no error,
   no warning). This is the single most important lesson from this whole migration: **a clean run
   with zero warnings is not the same as a correct run.** The dry run's row-count summary looked
   perfect throughout; nothing about it could have revealed this. It was only caught by manually
   querying `select id, project_id, app from feeds where feed_id = 'feed_1'` after the fact and
   noticing there was only one row where there should have been several.

   Fixed via `20260801000011_fix_feed_id_collisions.sql`: `feeds.id` became a synthetic
   `<project_id>::<app>::<feed_id>` key (raw `feed_id` preserved in its own column), every
   downstream reference (`posts.feed_id`, `participants.feed_id`, `feed_surveys.feed_id`,
   `survey_responses.feed_id`) recomposed the same way in the script, and
   `survey_responses.feed_id`'s foreign key was dropped entirely — separately discovered in the
   same run, some survey responses legitimately reference feeds that have since been renamed or
   deleted, and response data is historical/audit-shaped, so enforcing strict referential
   integrity there was rejecting real data, not catching a real bug. `feed_surveys` links get the
   same historical-staleness problem (a survey's `feed_sequence_ids` can list a retired feed) but
   handled differently: filtered out with a warning per survey rather than relaxing that FK too,
   since a dangling *link* isn't worth preserving the way a historical *response* is — and
   filtering client-side also avoids the batched-upsert failure mode where one bad row would
   otherwise have dropped every other valid link in the same batch.

   The fix was verified two ways before re-running for real: a standalone mock test with two
   projects sharing a raw `feed_id`, confirming they compose to distinct ids
   (`proj_A::fb::feed_1` vs `proj_B::fb::feed_1`) and that a stale `feed_sequence_ids` entry gets
   dropped-with-warning rather than failing its whole batch; then the actual re-run against real
   data, confirmed by the same manual query this time showing 10 distinct rows for `feed_1` across
   different real projects/apps.

The final clean `--apply` run: 7 projects, 56 feeds, 474 posts, 730 participants, 36 surveys, 15
feed_surveys links (down from an initially-reported 45 — the 45 included silently-wrong
cross-project matches that only existed *because of* the collision bug above; 15 is the correct
count), 849 survey_responses, 6 experiment_assignments, 14 warnings (all legitimate stale
`feed_sequence_ids` entries, now handled gracefully instead of either crashing or silently
corrupting data).

**What's still unverified**: whether every field on every one of the 36 surveys' `definition`
JSONB round-trips correctly through the admin editor once Phase 4 actually reads from Supabase —
the shape was verified against `normalizeSurvey`/`frontendSurveyToBackend`'s own output, not
against a live render. That's Phase 4's job, same as everywhere else in this migration.

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

## What Phases 1–3 deliberately leave out

- No Edge Function for reading/rendering a survey — per the plan, plain reads go straight through
  PostgREST + the public-read RLS policy on `surveys`, same as `feeds`/`posts`. Only the *write*
  path needed a function, for the sanitization gate.
- `upload_video` (currently Drive-based) is untouched; whether to move it to S3 alongside images
  is still an open question for the user to confirm, not decided here.
- Storage bucket / RLS policies for file uploads aren't covered — the plan notes images already
  go through a separate S3 signer, out of scope for this schema.
- ~~`save-survey` isn't wired to anything~~ — **superseded, see "Phase 4" below**: it's wired now,
  behind `VITE_BACKEND`.
- ~~Admin accounts were never migrated by the Phase 3 script... still need to be recreated~~ —
  **superseded**: a real admin account already existed in Supabase Auth from Phase 1 setup
  (`jason.weismueller@gmail.com`, role `owner`) and Phase 4 confirmed login through it works live.
- This Supabase project was migrated into once, from a point-in-time copy of the spreadsheet. Real
  participants have kept using the live Apps Script backend throughout Phases 1–3 (nothing here
  affects it), so a second, final migration run — same script, same `--apply` — will be needed
  right before actual cutover to catch anything added since this copy was made, per the plan.

## Phase 4 — Frontend wiring (2026-08-02, substantially done)

Full narrative — what was ported, the real `save-survey` bug found and fixed, the default-feed
schema gap, how it was verified, and the 5–8x performance finding — lives in `CLAUDE.md`'s
"Backend migration" section, not duplicated here (matching how this file already points to
CLAUDE.md for the "why migrate at all" question). Short version:

- Two new files: `src/utils/utils-supabase-client.js` (client singleton + the `VITE_BACKEND`
  switch) and `src/utils/utils-backend-supabase.js` (every Supabase-specific implementation,
  one-directional dependency from `utils-backend.js` — no circular import).
- Nearly the entire surface `utils-backend.js` exposes now has a working Supabase path: admin auth,
  projects/feeds/posts (read+write), surveys (read+write, via `save-survey`), participant-facing
  survey delivery, experiment group assignment (the Phase 1 RPC functions, called directly — no
  Edge Function needed for those), participant submission writes, and the participants/CSV export
  roster reads.
- `save-survey` was patched once during Phase 4: `feed_surveys` inserts used bare feed ids instead
  of the composed `<project_id>::<app>::<feed_id>` key migration `20260801000011` introduced —
  every survey save that linked feeds would have FK-violated. Fixed and redeployed.
- Not ported: admin user management (needs its own Edge Function — Supabase Auth admin operations
  require the `service_role` key, which can't reach the frontend), `wipeParticipantsOnBackend`,
  video upload. `loadMergedParticipantSurveyRoster`'s inline feed-survey lookup was left alone
  since the function is confirmed dead code (nothing calls it).
- Verified two ways: disposable test project/feed/survey exercised through every ported function
  via the browser console (confirmed via SQL, then deleted with zero orphaned rows across all 9
  related tables), and a real UI walkthrough as a participant — navigated to a live feed, reacted
  to a post, submitted the feed, answered and submitted the survey, confirmed the *real*
  interaction-tracking payload (not a hand-built test one) landed correctly in the database.

**Next**: admin user management (needs the Edge Function design decision above), then Phase 5
(parallel testing — user runs `npm run dev` locally with the flag flipped, clicks through the
full admin+participant flow once more end to end) before any real cutover conversation.
