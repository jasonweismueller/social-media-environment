# social-media-environment (aka "fakebook")

A research tool for running social-media-exposure studies. Participants are shown a simulated
Facebook, Instagram, or Amazon-reviews feed and/or a survey; researchers configure everything
(posts, feeds, surveys, experiment conditions) through an admin UI.

## Deployment: this repo auto-commits and auto-deploys — there is no staging buffer

Confirmed 2026-08-01, but true retroactively (see the several "Status: implemented and
committed" notes below from earlier sessions — that phrasing was already accurate before anyone
had spelled out the mechanism). Something outside Claude's own tool calls auto-commits
working-tree edits (authored as the user, Jason Weismueller) and pushes them to `origin/main` on
GitHub — Claude never runs `git commit`/`git push` itself this session, yet `git log` shows a
fresh commit per logical chunk of work, already on `origin/main`. `main` then appears to
auto-deploy to the live site (`studyfeed.org`): confirmed by finding a JS chunk
(`AdminEntry-*.js`, from a component written earlier the same session) already being served in
production, before any explicit deploy step was taken by anyone.

**Practical implication: there is no "save my work, review later" phase for this repo. A file
edit this session is very likely a production change on a live research study within the same
session** — serving real participants (often recruited and paid via Prolific), not a sandbox.
Combined with `npm run dev`/`npm run build` both being broken in this sandbox (see "Build/dev
notes"), changes typically ship with only static syntax-checking and careful code reading behind
them — no live browser click-through is possible from here. Weigh that when deciding how
confident to sound about something being "fixed," and say plainly when it's unverified.

## Architecture

**Three parallel frontend apps, one shared core.** `index.html` picks which app bundle to load
at runtime based on the `?app=` URL param (`fb`/`facebook`, `ig`/`instagram`, `amz`/`amazon`),
via a dynamic `import()`. Each has its own entry point and top-level App component:

- `src/main-facebook.jsx` → `src/App-facebook.jsx`
- `src/main-instagram.jsx` → `src/App-instagram.jsx`
- `src/main-amazon.jsx` → `src/App-amazon.jsx`

**These three `App-*.jsx` files are near-duplicates of each other**, not a shared component —
survey loading, participant logging, experiment-group assignment, reminder preloading, etc. are
all reimplemented per file. When fixing something in one, check whether the same fix is needed
in the other two. This has repeatedly been a source of bugs where a fix only landed in
`App-facebook.jsx` (the most actively developed one) and Instagram/Amazon silently lacked it.

**Per-app post rendering also differs structurally**, not just visually:
- `src/ui-posts/ui-posts-facebook.jsx` — needs an externally-computed `assignedAvatarUrl` /
  `assignedAuthor` prop (computed by the `Feed` component across all posts at once) to honor
  "randomize avatars/names".
- `src/ui-posts/ui-posts-instagram.jsx` — computes its own random avatar/name internally via a
  `useEffect` + `getAvatarPool`/`pickDeterministic`, self-contained, ignores any
  `assignedAvatarUrl` prop.
- `src/ui-posts/ui-posts-amazon.jsx` — has no photo avatars at all, just a letter-in-a-circle
  (`.amz-avatar`). Avatar-pool-related code is a no-op there.

`src/ui-posts/index.js` picks which of the three to export as `PostCard`/`Feed` based on
`getApp()` at module-load time.

**Shared survey engine**: `src/ui-core/ui-survey.jsx` (desktop) and `ui-survey-mobile.jsx`
(mobile) are genuinely shared across all three apps and render whichever `PostCard` the current
app resolved to. `src/utils/utils-survey.js` holds the survey data model (pages, page blocks,
experiment groups, question types) and is the single source of truth for that shape —
`normalizeSurvey`, `materializePagesFromBlocks`, `reconcilePageBlocks`, etc.

**Admin editor**: `src/admin/components-admin-surveys.jsx` (survey list/detail/launch/CSV export)
and `components-admin-surveys-editor.jsx` (question/page-block/experiment-group editing UI).

**Admin dashboard shell** (redesigned, see "Admin dashboard redesign" below): `AdminDashboard`
in `src/admin/components-admin-dashboard.jsx` owns all project/feed/post state and renders
`src/admin/AdminShell.jsx` (sidebar nav layout) wrapping a nested `<Routes>` tree under
`/admin/*` — one route per section (Feeds/Posts/Surveys/Participants/Users). Shared design-system
primitives (`Button`, `Toggle`, `Card`, `Badge`, `PageHeader`, `Table`, `Popover`,
`OverflowMenu`) live in `src/admin/ui/`, imported by both `components-admin-dashboard.jsx` and
`components-admin-surveys.jsx`. **`components-admin-surveys-editor.jsx` (the question/page
builder, 4,400+ lines) was deliberately left untouched by that redesign** — it keeps its own
local `SectionCard`/`SecondaryPillButton`, by design, not an oversight.

## Backend: Google Apps Script (NOT in this repo)

The actual backend is a `Code.gs` file living in a Google Apps Script project bound to a Google
Sheet (`SPREADSHEET_ID` in Code.gs), reachable at `GS_ENDPOINT`. **It is not checked into this
repo and Claude cannot read or edit it directly.** Whenever backend logic needs to change, the
only way to do it is to give the user an updated `Code.gs` (or a diff) to paste into the Apps
Script editor themselves.

**Critical**: after pasting any Code.gs change, the user must go to
**Deploy → Manage deployments → Edit → New version → Deploy**. Saving the script alone does
**not** update the live web app — it keeps serving whatever was live at the last deployment.
This has been the cause of "I made the fix but it's still broken" multiple times this session.

### Google Sheets constraints that have bitten us

- **10,000,000 cells per workbook**, total, across every tab. Every `ensureSheet_()` call that
  creates a brand-new tab starts it at Google's default size (1000 rows × 26 cols = 26,000
  cells) even if the tab only ever holds a one-cell JSON blob. `ensureSheet_` is *supposed* to
  trim a freshly-created sheet down immediately via `trimSheetToContentSize_(sh, 2, 2)` — **but
  for an unknown stretch of time that function was called and never defined**, so every
  first-ever write to a brand-new sheet threw a `ReferenceError` and silently dropped the data
  (see "Survey submission bugs found and fixed" below for how this was found and the function
  that was added). If untrimmed 26,000-cell sheets pile up and the 10M-cell ceiling gets hit
  anyway, the fix is a one-time `trimAllSheetsToContentSize_()` sweep across existing sheets, run
  manually from the Apps Script editor (not written yet as of 2026-08-01).
- **50,000 characters per individual cell.** A single large survey's JSON blob can exceed this.
  `writeSurveyJSON_`/`readSurveyJSON_` now chunk the JSON across multiple rows in one column
  instead of one cell — don't revert to a single `setValue()` call for survey JSON.
- **`CacheService.getScriptCache()` is global**, shared across *every* participant/admin hitting
  the script — not per-browser. This makes caching genuinely effective even though each
  participant only visits once (the first participant of a feed/survey warms the cache for
  everyone after them).
- Apps Script HTTP invocation has real fixed overhead per request — batching multiple lookups
  into one call (e.g. reusing the `posts` cache for `post_by_id` instead of a separate uncached
  read) matters more than the payload size does.

## Known duplicated logic (footguns)

Page-block reconciliation (turning `page_blocks` + `pages` into a clean, validated block list)
is independently reimplemented in **four places** — Code.gs (`sanitizeSurveyPageBlocks_`),
`utils-survey.js` (`reconcilePageBlocks`), `components-admin-surveys-editor.jsx`
(`normalizeSurveyPageBlocks`, local), and `components-admin-surveys.jsx` (`normalizeSurveyPageBlocks`,
a *different* local function despite the same name). When adding a field to blocks (as with
`visible_to_group_ids` for experiment groups), **all four must be updated** or the field gets
silently stripped somewhere in the load/save round-trip. Same risk applies to anything added to
`experiment_groups`.

Same footgun bit `ThankYouOverlay` (fixed 2026-08-01, see "Survey submission bugs" below): the
component is defined separately in `ui-core-facebook.jsx`/`-instagram.jsx`/`-amazon.jsx`, and
the `App-*.jsx` call sites were updated to pass new props (`title`/`messageHtml`/
`completionCode`/`hideSessionId`) that only got wired up in the component definition itself
for... none of the three, at first. Any time a prop gets added to a call site of a
per-app-duplicated component, grep for every definition of that component before assuming it's
handled.

## Experiment groups feature (implemented, see plan file)

Between-subjects experiment support: survey-level `experiment_groups: [{id, name}]`, per-block
**and per-question** `visible_to_group_ids: []` (empty = shown to everyone), server-coordinated
round-robin assignment (`assign_experiment_group` Apps Script action, `LockService`-guarded,
idempotent per `session_id`), plus an admin-only `reset_experiment_group_assignments` action
(clears `ExperimentAssignments` + the round-robin counter for one survey, for when the live
balance has drifted — e.g. participants started but never finished). Full design rationale and
file-by-file breakdown: `~/.claude/plans/dapper-growing-emerson.md`.

**Status: frontend fully implemented and committed** — commit `001f463 add survey group
randomizer` for the original block-level version; the later question-level `visible_to_group_ids`
and reset-balance UI/backend-call work ended up bundled into commit `64f20ed complete redesign of
admin dashboard` (same session, committed together with the unrelated dashboard redesign — don't
be misled by the commit message). **Backend Code.gs changes were handed to the user as a
copy-paste-ready full file twice** — once for the original block-level feature, once more for the
question-level + reset-balance additions — **not applied by Claude** (can't touch their Apps
Script directly either time). **Confirmed 2026-08-01**: the user pasted their live Code.gs in
full during an unrelated debugging session, and it does include `assignExperimentGroup_`,
`resetExperimentGroupAssignments_`, and `sanitizeSurveyPageBlocks_` with `visible_to_group_ids`
support — so the backend half of this feature was pasted and deployed at some point before that
date. (That same live Code.gs was missing `trimSheetToContentSize_` — see "Survey submission
bugs found and fixed" below — so "the file was pasted at some point" doesn't mean every later
handoff made it in; if experiment groups misbehave, it's still worth confirming the specific
functions above are present in whatever Code.gs is live *now*.)

## Admin dashboard redesign (implemented, see plan file)

The admin dashboard went from one long single-page accordion (Projects/Feeds/Posts/Surveys/
Participants/Users all simultaneously mounted, `xCollapsed` booleans) to a real left-sidebar +
routed-pages layout under `/admin/*`, plus a shared `src/admin/ui/` design system replacing the
per-file-duplicated `Section`/`SectionCard`/`ChipToggle`. Full design rationale, the two bugs
found and fixed post-implementation, and what's still unverified:
`~/.claude/plans/parallel-swinging-emerson.md`.

**Status: implemented and committed** (`64f20ed`, `8f9a00a`, `d9ef8a6`). **No live browser
click-through has been done from Claude's side** — the dev server hangs in the sandbox this was
built in (see Build/dev notes below). If something in the admin UI seems broken in a future
session, do a manual click-through first before assuming the code is wrong; two real bugs were
already found this way (both fixed — see the plan file) that static syntax-checking alone could
never have caught.

**The one gotcha to remember if you touch this again**: every `NavLink to=` and `<Navigate to=>`
inside the `/admin/*` subtree **must be an absolute path** (`/admin/feeds`, not `feeds`).
React Router resolves relative link targets against the current URL segment, not the route's
base — a relative target here silently keeps appending onto the existing path on every
navigation instead of replacing it, and it's easy to not notice until you actually click a nav
link twice.

**Superseded 2026-08-01** by the Projects → Platform → Dashboard flow below: `AdminDashboard` is
now mounted one level deeper, at `/admin/dashboard/*` instead of `/admin/*` — every concrete path
example above (`/admin/feeds` etc.) is now `/admin/dashboard/feeds`. The absolute-path gotcha
itself still applies unchanged, just one segment deeper.

## Admin dashboard: Projects → Platform → Dashboard flow (2026-08-01, see plan file)

Restructured the admin entry flow from "log in → straight into one dashboard" to "log in → pick
a project (full page) → pick a platform (fb/ig/amz, full page) → dashboard," with a
"← All projects" back link, replacing an in-sidebar project `<select>` that was too cramped for
long names and mixed create/delete/set-default actions in with routine navigation. Full design
rationale, the two hard constraints that shaped it (platform is chosen by which JS bundle loads,
before React mounts; admin sessions were namespaced per-app), and verification steps:
`~/.claude/plans/ancient-mixing-knuth.md`.

Key pieces:
- `src/admin/AdminEntry.jsx` (new) — owns `/admin/*` sub-routing (index → project picker,
  `/platform` → platform picker, `/dashboard/*` → existing `AdminDashboard`). Mounted
  identically in all three `App-*.jsx` files, replacing the old
  `adminAuthed ? <AdminDashboard/> : <AdminLogin/>` ternary — this branching logic lives in
  exactly one shared place, specifically to avoid the near-duplicate-`App-*.jsx` footgun above.
- `src/admin/AdminProjectPicker.jsx`, `src/admin/AdminPlatformPicker.jsx` (new) — full-page
  pickers. The project list is intentionally app-agnostic: the live Code.gs's `listProjects_`
  ignores the `app` query param entirely and `project_create` never sent one, so a project can
  hold feeds across fb/ig/amz simultaneously — nothing backend-side restricts it to one
  platform.
- `src/utils/utils-backend.js` — admin session localStorage keys (`ADMIN_TOKEN_KEY` etc.,
  ~line 1316) are no longer namespaced by `${APP}`; one login now covers all three platforms.
  This was necessary because picking a different platform than the one currently loaded does a
  full page navigation (`?app=` is resolved by `index.html`'s dynamic `import()` before React
  mounts, so the platform can't be swapped client-side) — without a shared token, that navigation
  would have forced a second login every time. Also dropped a stray `&app=` param from
  `PROJECTS_GET_URL` that the backend never read.
- `src/admin/AdminShell.jsx` — nav paths moved to `/admin/dashboard/*` (see gotcha note above);
  added `backTo`/`backLabel` props for the "← All projects" link.
- `src/admin/components-admin-dashboard.jsx` — sidebar's project switcher (`<select>` +
  create/delete/set-default buttons) replaced with a read-only project-name readout; those CRUD
  actions moved to `AdminProjectPicker`.

**Status: implemented, auto-deployed (see Deployment section above), never clicked through live
from Claude's side.** If the picker flow seems broken, do a manual click-through first — same
lesson as the original admin redesign, twice now.

## Admin UI polish: feed list, Popover, project identity (2026-08-01)

Follow-up fixes to the admin dashboard redesign, prompted by direct user feedback after using it
for real:
- `src/admin/ui/Popover.jsx` — the Randomize-flags and "⋯" overflow-menu dropdowns now portal
  into the nearest `.admin-shell` ancestor (not `document.body`) instead of rendering as an
  absolutely-positioned in-tree child. Two reasons this mattered: (1) `Card`/`Table` ancestors
  clip via `overflow: hidden`/`auto`, cutting the dropdown off when the surrounding list is
  short; (2) the `--admin-*` design tokens (`src/admin/ui/tokens.css`) are scoped to
  `.admin-shell` — portaling all the way to `document.body` (the first attempt) left the
  dropdown with no background/border/color at all, since those CSS variables don't exist that
  far up the DOM.
- `src/admin/ui/Table.jsx` — added a `dense` variant (`Th`/`Td` accept a `dense` prop, tighter
  padding), used only on the Feeds table; other admin tables unaffected.
- `src/admin/ui/Card.jsx` — the header's title/subtitle wrapper div now only renders when there
  actually is a title or subtitle. Previously an empty wrapper always rendered as a flex sibling
  to `actions`, and `justify-content: space-between` pushed `actions` all the way to the right
  against that empty space. The Feeds table toolbar (`actions` with no `title`) was the only
  place in the whole admin section combining the two that way — safe to fix at the shared-Card
  source rather than patch around it locally.
- Feeds table: switched to `table-layout: fixed` with explicit column-width percentages so the
  Actions column (3-4 buttons) doesn't get squeezed by auto-layout favoring Name/ID/Updated;
  "Updated" now shows date only (full timestamp still available via `title` on hover).
- Toolbar buttons ("Hide full list"/"All feeds…", "+ New feed", "Refresh") unified to the same
  `Button` variant — they were a visually-inconsistent mix of `ghost` (no border) and
  `secondary` (bordered) for equally-weighted actions.

## Survey submission bugs found and fixed (2026-08-01)

Traced from a real report: submitting a completed survey showed no thank-you message or
redirect, and the CSV export had no data. Four separate bugs surfaced; three fixed in this repo,
one needs a manual check only the user can do.

1. **Code.gs: `trimSheetToContentSize_` was called but never defined** — see the Google Sheets
   constraints note above. Silently dropped every first-ever write to a new
   `SurveyResponses`/`Participants` sheet (backend still returned HTTP 200 with
   `{ok:false, err:"trimSheetToContentSize_ is not defined"}`, which the client didn't check —
   see bug 4). **User added the function themselves** during the session. **Unverified whether
   it's been redeployed** (Deploy → Manage deployments → Edit → New version → Deploy) — check
   this first if data is still missing in a future session.
2. **`ThankYouOverlay` ignored the props it was called with** — see the duplicated-logic entry
   above. Fixed in all three `ui-core-*.jsx` files.
3. **Redirect-on-completion still doesn't fire for at least one survey — root cause
   unconfirmed.** `finalizeStudyCompletion` (`App-facebook.jsx` ~line 2394, duplicated per app)
   redirects only when `linkedSurvey.completion_mode === "redirect"` AND
   `completion_redirect_url` is non-empty. The full data path (admin editor →
   `frontendSurveyToBackend` → Code.gs `sanitizeSurveyDef_` → `normalizeSurvey`) reads correct
   on inspection — nothing found in the code that would drop or mis-map those two fields. Since
   the user saw `ThankYouOverlay`'s content rather than a redirect, `completion_mode` and/or
   `completion_redirect_url` were not actually `"redirect"`/non-empty for that specific survey
   at submit time. **Next step is for the user to open that survey in the admin Surveys editor
   and confirm both the mode toggle and the URL field are actually set and saved** — not
   diagnosable further from code alone without live access to that survey's saved definition.
4. **`saveSurveyToBackend` timeout too short for large surveys** — reported as `"signal is
   aborted without reason"` needing 3-4 retries to save. `postJson`'s default abort timeout is
   12s (`utils-backend.js` `fetchWithTimeout`); saving a survey fans out to a chunked definition
   write plus a `linkSurveyToFeed_` call per linked feed × app on the Code.gs side, which grows
   with survey size/linked-feed count and can exceed 12s — the save often completes server-side
   after the client already gave up (all the writes involved are upserts, so the repeated
   retries this produced were wasteful but not harmful). Bumped `saveSurveyToBackend`'s timeout
   specifically to 45s; left every other `postJson` call at the 12s default.

## Survey editor: question card layout (2026-08-01)

`components-admin-surveys-editor.jsx` `QuestionCard`: the header used to be a 3-column CSS grid
(question-text editor | type dropdown | actions) — since the rich-text editor needs real height,
the whole row (including the type dropdown and action icons, which don't need that height) got
forced tall with wasted space. Now it's two stacked rows: Type + Actions on a compact top row,
the question-text editor full-width below.

The "collapsed" state used to only hide the fields *below* the header — the full rich-text
editor and type dropdown still rendered at full height either way, so collapsing barely saved
space. Added `CollapsedQuestionRow`, a genuine one-line summary (chevron, drag handle, `Q#`,
type badge, required dot, truncated plain-text preview, reorder/copy/delete), styled to match
the existing compact rows in the study-outline panel (`OutlineRow`) rather than inventing new
visual language.

## Post editor redesign (2026-08-01)

`components-admin-editor-{facebook,instagram,amazon}.jsx` + their `components-admin-media-*.jsx`
`MediaFieldset`s went from a flat, unstructured stack of `<h4 className="section-title">` +
`<fieldset className="fieldset">` pairs (no dedicated `label`/`.row`/`.checkbox` CSS existed for
them at all — they were relying on browser defaults) to collapsible card sections, matching the
admin dashboard's own visual language.

New shared file **`src/admin/components-admin-editor-ui.jsx`** exports the primitives used by all
three editors: `EditorSection` (collapsible card — reuses the `.section-collapse` /
`.section-collapse-inner` / `.section-chev` CSS that already existed identically in all three
stylesheets but, before this, had no JSX anywhere actually using it), `Field` (label-above-control,
single control only — implicit label association), `Group` (same look as `Field` but a `<div>`
root, for radio/checkbox groups where nesting a `<label>` would be invalid HTML), `RadioGroup`,
`CheckRow`, and `PreviewPane` (the sticky live-preview column, now a consistent "device frame" look
across all three apps). It re-exports `Toggle` from `src/admin/ui/` so boolean fields (badge,
show-bio, verified-purchase, etc.) are a real switch instead of a `<select>` with `"true"/"false"`
string options.

**Zero CSS file changes were needed.** The outer `.editor-grid`/`.editor-form`/`.editor-preview`/
`.preview-zoom` grid (responsive collapse at 980px, sticky preview) was reused as-is — those
classes are exclusive to the three post editors, so was safe to keep unchanged. Section cards reuse
the existing `.card` class. Field width is just flexbox: `Field`/`Group` are `flex-direction:
column`, and flex's default `align-items: stretch` makes the `input`/`select`/`textarea` child fill
the width with no extra CSS.

**Update (same day, second pass, per direct user feedback):** all sections now default collapsed
— no exceptions, including Basics/Post Media/Reactions. The original "smart open" heuristic
(open a section by default if it already holds non-default content) was replaced by `badge` chips
on the collapsed header instead (e.g. "Ad", "On", "Custom") so configured sections are still
visible at a glance without forcing them open.

Facebook's "Link preview / Ad" and "Intervention" sections were merged into one **"Post type"**
card with a single top-level selector (Regular post / Sponsored ad / News link preview /
Intervention → then Label or Note). The underlying `adType` and `interventionType` fields are
still independent in the data model — `InterventionBlock` in
`src/ui-posts/components-ui-interventions.jsx` renders purely off `interventionType` regardless of
`adType`, so a post can technically carry both at once. The merge derives the unified selector
value from whichever is set (`postType = hasIntervention ? "intervention" : editing.adType`)
**without mutating anything on render** — only an explicit change to the dropdown
(`setPostType` in `components-admin-editor-facebook.jsx`) clears the other dimension. So opening
the editor on an old post that happens to have both set won't silently drop one of them; it only
becomes truly either/or once an admin actively touches the selector. Instagram/Amazon don't have
an Intervention field in their editors at all (Instagram's data model carries
`interventionType`/`noteText` defaults from `makeRandomPost()` but no editor UI ever exposed them,
even before this redesign — a pre-existing gap, left as-is), so only Facebook's editor got this
merge.

**Duplicate "post name" field removed.** Before this pass, the post name/label used in CSV export
headers could be edited in *two* different places that partially overlapped: the Basics section's
"Post name (for CSV)" field (`editing.postName`, only written to storage when the whole editor is
saved) and a second field inside `MediaFieldset` (`editing.name`, written straight to the
`postNames` localStorage map — see `readPostNames`/`writePostNames` in `utils-backend.js` — on
every blur, bypassing Cancel entirely). `components-admin-dashboard.jsx`'s `saveEditing()` already
treated these as the same concept (`if (clean.postName && !clean.name) clean.name = clean.postName`
and it separately writes `postNames[clean.id] = clean.postName` on every save), so the
`MediaFieldset` copy was pure redundant surface area, not a distinct feature — removed from both
the Facebook and Amazon media fieldsets (Instagram's `MediaFieldset` never had this field to begin
with). The post ID readout that lived next to Facebook's duplicate field was preserved by folding
it into the Basics field's hint text instead of being dropped.

Every field's `value`/`onChange` handler was copied verbatim from the old markup — only the
surrounding structure changed. Verified via diff: identical sets of `editing.*`/`ed.*` field
references and identical `setEditing(` call counts between old and new versions of all six files
(see git history for the exact commit). **Not click-tested live** — same sandbox dev-server
limitation as the admin dashboard redesign above (`npm run dev` hangs here); only syntax-checked
via the `@babel/parser` workaround. Do a manual click-through in a future session before assuming
edge cases (e.g. the note/label intervention meta-groups sub-UI, or the Instagram carousel
image cropper) render correctly, the same lesson as the admin dashboard and Projects→Platform→
Dashboard flow above.

## Admin sidebar nav: fixed height-stretching bug (2026-08-01)

`AdminShell.jsx`'s `<nav>` (Feeds/Posts/Surveys/Participants/Users links) was `display:"grid"` with
`flex:1` (to push the "Log out" button to the bottom of the sidebar). That combination made every
nav row visibly oversized: a CSS grid container's implicit auto-sized rows default to
`align-content: normal`, which computes to `stretch` when there's no override — so with `flex:1`
making the `<nav>` itself tall, the 5 nav-item rows stretched to evenly fill all the leftover
vertical space instead of sizing to their own content. Changed `<nav>` to
`display:"flex", flexDirection:"column"` instead — flex items don't grow along the main
(vertical, for a column) axis without an explicit `flex-grow`, so rows now size to content while
`<nav>`'s own `flex:1` still pushes "Log out" to the bottom exactly as before. Also trimmed
per-item padding from `9px 10px` to `7px 10px` per direct user feedback ("a bit tighter"). Not
click-tested live (same sandbox limitation as elsewhere in this file) — worth a quick visual check.

## Delete survey response data (2026-08-01)

Added a "Delete survey data" button next to the CSV download button(s) in the Surveys admin →
"Launch links and IDs" panel (`components-admin-surveys.jsx`, `handleDeleteSurveyData`), styled
like the existing destructive "Reset balance" button (`#fca5a5` border / `#b91c1c` text), gated
behind a `window.confirm` warning it's irreversible and scoped to response data only (the survey
definition itself is untouched). Calls new `deleteSurveyResponsesOnBackend()` in
`utils-backend.js`, which POSTs a new `delete_survey_responses` action
(`{ app, admin_token, project_id, survey_id }`) — mirrors the existing
`resetExperimentGroupAssignments`/`deleteSurveyOnBackend` pattern exactly.

**Code.gs side: written precisely (not guessed) and handed to the user, status of paste+redeploy
unconfirmed.** Unlike every other backend addition in this file, this one was deliberately *not*
handed over as a best-effort guess first — getting a delete operation wrong on live spreadsheet
data is a much worse failure mode than getting a read wrong. The user pasted their full live
Code.gs in chat, which resolved every unknown: response rows live in sheets named
`SurveyResponses::{project}::{feed}::{survey}` (`surveyResponsesSheetName_`, IG/AMZ-prefixed for
those apps) — confirmed **not** one flat sheet, so a multi-feed-then-survey study can have its
responses spread across more than one sheet, one per feed_id used. New function
`deleteSurveyResponsesForSurvey_(ss, app, project_id, survey_id)` (added after
`wipeSurveyResponsesForFeedSurvey_`) mirrors `readSurveyResponsesBySurvey_`'s existing
prefix/suffix sheet-matching exactly (same app-scoping too, so it never deletes more than what the
CSV download sitting next to the button would have included), then `ss.deleteSheet()`s each match
inside a `LockService.getScriptLock()` — same "delete the whole sheet, not just its rows" pattern
as `resetExperimentGroupAssignments_`/`wipeSurveyResponsesForFeedSurvey_` already use elsewhere in
this file (safe because `ensureSheet_` trims a freshly recreated sheet, so this doesn't reintroduce
the 26,000-cell default-size problem). Wired into `doPost`'s admin-gated switch as
`case 'delete_survey_responses':`, `requireRole_(session, ['editor'])`, right next to
`case 'wipe_survey_responses':`. **Next step**: confirm the user has pasted both pieces and done
Deploy → Manage deployments → Edit → New version → Deploy — until then the frontend button calls
an action the backend doesn't recognize yet and fails with a clear error alert (not silently).

## Small polish batch (2026-08-01)

Five direct-user-feedback fixes, all small/isolated:

- **Live preview centering** (`components-admin-editor-ui.jsx` `PreviewPane`, `.preview-zoom` in
  all 3 stylesheets): `transform-origin` was `top left`. The frame centers `.preview-zoom` via
  flexbox *before* the `scale(.9)` transform is applied, so a `top left` origin shrinks the box
  toward its top-left corner instead of its already-centered middle, visually pulling the post
  preview off-center. Changed to `top center` — scaling now stays centered on the horizontal axis
  while still anchored to the top edge vertically (no new empty space above the card).
- **Posts admin table, Actions cell divider misaligned** (`components-admin-dashboard.jsx`, Posts
  route): the Actions `<Td>` had `style={{ display: "flex", ... }}` set directly on the cell.
  Overriding a `<td>`'s `display` away from `table-cell` pulls it out of the table layout
  algorithm, so its border-bottom no longer lines up with sibling cells' — exactly the "divider
  below the action buttons sits at a different height" symptom reported. Fixed by keeping `<Td>`
  as a plain cell and moving `display:flex` onto a `<div>` wrapper inside it instead.
- **Survey editor question cards now collapse by default** (`components-admin-surveys-editor.jsx`
  `SurveyEditor`): `collapsedQuestionIds` used to initialize to an empty `Set` (all expanded). Now
  lazily initializes to every non-page-break question's `_editorId` — the same set
  `collapseAllQuestions()` already computes, just applied as the starting state instead of a user
  action.
- **`CollapsedQuestionRow` now shows the real question `id`** next to the `Q1`/`Q2` display number
  (small monospace tag, truncated with a full-id tooltip) — the display number alone doesn't help
  when cross-referencing `visible_in_feeds`/`feed_overrides`/`visible_to_group_ids` elsewhere,
  which key off the actual id.
- **Post reminder collapsed preview no longer shows a placeholder when empty**: same function used
  to fall back to `"(no display text yet)"` for every display-only question type when `q.text` was
  blank. For `post_reminder` specifically, blank is normal (the shown content comes from the
  referenced post, not `q.text`), so the preview text is now just blank there — `"info"` blocks
  still show the placeholder, since an empty info block usually *is* an oversight worth flagging.
- **Page-break card is now a single compact row** instead of a 3-column grid of full-height
  labeled fields (`TopField` "Page break" / "Next delay (sec)" / "Actions", each contributing
  label height + `INPUT_HEIGHT`(42px) on top of the shell's own padding/margins). Same
  functionality (drag handle, reorder, delay input, delete) in one inline row now — no more stacked
  labels for what is conceptually just a divider marker.

None of these were click-tested live — same sandbox dev-server limitation noted throughout this
file.

## Experiment group missing from survey CSV export (2026-08-01)

Root cause found and fixed on the frontend only — no Code.gs change needed this time. The backend
already stores `experiment_group_id` on every `SurveyResponses` row (confirmed present in the live
Code.gs's `handleLogSurveyResponse_` header). The bug was in `utils-backend.js`'s CSV-roster
builders, which read that backend data through **hardcoded field whitelists** that simply didn't
list `experiment_group_id`, silently dropping it before it ever reached the CSV:

- `loadSurveyOnlyRoster`'s `participantRows` mapping (feeds "Download survey CSV") — added
  `experiment_group_id: row?.experiment_group_id ?? ""`.
- `mergeParticipantRowsWithSurveyRows`'s `orderedParticipant` (shared by `loadSurveyOnlyRoster` and
  the unused-but-fixed-anyway `loadMergedParticipantSurveyRoster`) — added `experiment_group_id`
  *and* a resolved `experiment_group_name` (via new `resolveExperimentGroupName()` helper, looked
  up against `survey.experiment_groups`), both **only when the survey actually has
  `experiment_groups`** — otherwise the columns don't appear at all, so non-experiment surveys'
  CSVs stay unchanged.
- `loadMultiFeedParticipantSurveyRoster` (feeds "Download multi-feed CSV") — same two columns,
  added directly in its own bespoke row-merge (it doesn't go through
  `mergeParticipantRowsWithSurveyRows`).

Both CSV buttons in `components-admin-surveys.jsx` already build their header row dynamically from
`Object.keys()` across all response rows, so no change was needed there — once the roster
functions stopped dropping the field, the columns appear automatically. Not click-tested against a
real experiment-group survey (same sandbox limitation) — worth downloading a CSV from a survey with
groups configured to confirm both `experiment_group_id` and `experiment_group_name` show up with
the expected values.

## Survey/posts loading performance fixes (2026-08-01)

Root cause investigation for "survey loading (loading questions) sometimes runs ~15 seconds for
participants." Two real bugs found and fixed; both make the case that the backend architecture
itself has a ceiling caching can't fully solve (see "Backend migration planning" below).

1. **Redundant network round-trip on every survey load — fixed, frontend-only, committed.**
   `ensureSurveyLoaded()` (in all three `App-*.jsx`) called `getSurveyForFeedFromBackend()`,
   which did two *sequential* Apps Script requests: first "which survey is linked to this feed?"
   (`FEED_SURVEY_GET_URL`), then "give me that survey's definition." The first is redundant —
   `surveyBoot` (already fetched earlier, at initial page boot) already has the `survey_id`,
   because every feed in a `feed_sequence_ids` gets linked to the same survey server-side
   (`handleSaveSurvey_` links all of them). Added a `knownLink` param to
   `getSurveyForFeedFromBackend()` (`utils-backend.js`) so the link lookup is skipped whenever
   already known; all three `App-*.jsx` now pass `{ survey_id: surveyBoot.survey_id, trigger:
   surveyBoot.trigger }` when available. Cuts one full Apps Script round-trip off every survey
   load.

2. **CacheService 100,000-byte-per-value silent-failure bug — diagnosed and fixed, handed to user
   as a full revised Code.gs, paste+redeploy status unconfirmed.** `cachePut_`'s try/catch
   silently swallows the error CacheService throws when a single cached value exceeds 100,000
   bytes. `readSurveyJSON_`/`writeSurveyJSON_` cache the *entire* reconstituted survey JSON as one
   value (even though it's already chunked across sheet *rows* to dodge the unrelated 50K-char
   Sheets cell limit) — so any survey whose JSON exceeds ~100KB (easy with several pages of
   rich-text questions) **never successfully caches, ever**, and pays the full
   open-spreadsheet-and-reconstruct cost on every single request. This matches "sometimes 15
   seconds" precisely: small surveys cache fine and load fast; larger ones never cache and are
   always slow. The same bug pattern hits `POSTS_CACHE_PREFIX` too, which matters here because
   `post_by_id` (used by survey-reminder preloading, see below) goes through it. Fix: added
   `cachePutChunked_`/`cacheGetChunked_`/`cacheDelChunked_` helpers (split a large value across
   `base::0`, `base::1`, ... keys plus a `base::n` count key) and swapped them in at every call
   site that can plausibly exceed 100KB — `readSurveyJSON_`/`writeSurveyJSON_`/`deleteSurveyJSON_`,
   the `doGet` `posts`/`post_by_id` handlers, `handlePublishPosts_`, and the two
   `POSTS_CACHE_PREFIX` invalidation call sites (`set_feed_flags`/`set_flags`, `deleteFeed_`).
   Deliberately left every other cache prefix (admin sessions, survey link, survey boot, surveys
   list, survey responses) on the plain unchunked helpers — those values are small and not at
   risk, no need to touch code that isn't part of the problem.

3. **Preloading was investigated and found already solid — no gap, nothing changed.** The user
   asked for posts/avatars/images (including randomized picks) to be preloaded. Both existing
   mechanisms already do this: the main feed's `assetsReady` gate (avatar/image pool preloading
   for `randomize_avatars`/`randomize_images`) and `preloadSurveyPostReminders`
   (`App-facebook.jsx`, mirrored in ig/amz) — which already preloads every post referenced by a
   `post_reminder` question in parallel, via a recursive walk that catches avatar/image/poster
   URLs by field-name pattern, and already special-cases randomized avatars (preloading the exact
   deterministic avatar the renderer will pick later, keyed off the same seed). The 15-second
   complaint was backend latency/caching, not missing preload logic.

Not click-tested live (same sandbox dev-server limitation as elsewhere in this file). Worth
confirming after redeploy: load the largest/most complex survey in the project first, since it's
the one most likely to have been silently failing to cache.

## Backend migration: Apps Script/Sheets → Supabase (2026-08-01 planning, Phases 1–3 done 2026-08-02, Phase 4 done + production cutover live 2026-08-02)

**Quick orientation if you're picking this up fresh**: production (`studyfeed.org`) has been
running on Supabase since 2026-08-02, and stayed live through several real post-cutover bugs found
and fixed the same day (worst one: a primary-key design flaw that had silently deleted most of the
app's post data — see "Real production data-completeness incident" below). Everything is fixed,
verified against real data, and committed. Plan-level status + what's actually left (mainly Phase 7
cleanup — GAS hasn't been decommissioned yet) is in `~/.claude/plans/gradual-migrating-codd.md`;
this section is the detailed narrative, read in file order (chronological) for the full story. If
you're about to say something "still works fine" post-migration, check whether that's because it
was actually verified or because it's quietly still running on GAS unported — that assumption was
wrong twice in this same session (`loadPostByIdFromBackend`, `linkSurveyToFeedsOnBackend`).

Following the investigation above, the user asked whether Apps Script itself is the wrong
long-term architecture now that the project has grown. Answer worked out with the user: yes —
genuine structural ceiling, not just a bug. Beyond the 100KB CacheService limit found above, this
app's storage model creates a new sheet per (project × feed) and per (project × feed × survey),
so the workbook accumulates sheets over a study's lifetime, and `SpreadsheetApp.openById()`/
`ss.getSheets()` (used by `readSurveyResponsesBySurvey_`, `listSurveyDefSheetRefs_`,
`readParticipantsBySurvey_`) get slower as sheet count grows — a well-known real-world
Sheets-as-a-database scaling limit, inherent to the platform, not something more caching fixes.

**Decision: migrate to Supabase** (managed Postgres + auto REST API + Auth + Storage) — the
current data model (Projects/Feeds/Posts/Participants/Surveys/SurveyResponses/
ExperimentAssignments/FeedSurveys) is already relational in shape, so this is a storage-layer
swap, not a logic rewrite. Full plan — entity-by-entity schema mapping, phase breakdown, and the
safety approach below — is in `~/.claude/plans/gradual-migrating-codd.md`.

**Status: Phases 1–4 complete, and production has been cut over to Supabase (2026-08-02).**
Everything `utils-backend.js` exposes now has a working Supabase counterpart. **The one Phase 4
prerequisite from the previous note is resolved**: a real admin account
(`jason.weismueller@gmail.com`, role `owner`) already existed in Supabase Auth from Phase 1 setup —
confirmed via `supabase db query --linked` against `auth.users`/`profiles`, and login through it
has been tested live in the browser. **Local dev state note**: the gitignored `.env` on this
machine was left with `VITE_BACKEND=supabase` (not `gas`) from earlier testing — if a future
session's `npm run dev` behaves unexpectedly like it's hitting Supabase, that's why; check `.env`
before assuming it's still on the default.

### Production cutover (2026-08-02)

**Deployment mechanism, now actually confirmed** (superseding the "external, not fully understood"
framing used throughout this file up to this point): it's GitHub Actions (`.github/workflows/
deploy.yml`, triggers on push to `main`, `npm run build` → GitHub Pages, custom domain
`studyfeed.org`), and the "auto-commit" part is the user's own GitHub Desktop app, not something
that fires without a manual click there — confirmed by observing zero auto-commits happen across
this entire session's substantial working-tree changes (admin-users, wipe-participants, wipe-policy
— all of it sat uncommitted until the user committed 616 files via that app in one batch, git
history showing exactly one commit `dcdefe4` for the lot). Earlier sessions' documented pattern of
"a fresh commit per logical chunk of work, already on origin/main" was real, just apparently
depends on that app being left open/attended; don't assume it fires unattended in a future session
— check `git status` against what you'd expect to be committed rather than assuming.

**How the actual flip works**: `VITE_BACKEND` needed to reach the GitHub Actions build environment
somehow. The workflow has no env vars wired in and no GitHub secrets were set (`gh` isn't
authenticated in this sandbox, ruling that path out anyway) — instead, a committed
**`.env.production`** file at the repo root, which Vite auto-loads for `npm run build` (production
mode) with zero workflow changes needed. Contains `VITE_BACKEND=supabase` plus the Supabase URL and
anon/publishable key — safe to commit despite the public repo, same reasoning as `.env.example`:
the anon key is meant to ship in the client bundle, RLS is the real gate, and the actual secret
(`service_role`) never appears in any repo file, only in Supabase's own Edge Function secrets.

**Sequenced as two deliberate commits, not one**, specifically because there's no staging
buffer for this repo: first `dcdefe4` (all Phase 4 code — Edge Functions, migrations,
`utils-backend-supabase.js`, etc. — genuinely inert without `.env.production`, verified by checking
the GitHub Actions build succeeded and the live site still loaded with zero console errors *before*
touching the actual switch), then `36824ef` (`.env.production` alone) as the real cutover, kept
small and isolated on purpose so it's easy to point at and easy to revert (deleting that one file
and pushing reverts to `gas` — no code changes needed, since the code already defaults to `gas`
whenever `VITE_BACKEND` is unset).

**Verified live post-deploy**: confirmed via the GitHub Actions API (repo is public, so this needed
no auth) that the build for `36824ef` completed successfully; fetched the deployed JS directly
(`https://studyfeed.org/assets/AdminEntry-*.js` — the shared chunk containing `utils-backend.js`)
and confirmed the Supabase URL and anon key each appear exactly once, baked in as literals,
proving `.env.production` was actually picked up and not silently ignored; loaded the live admin
login page in a real browser with zero console errors. Did not log in as the real owner (credential
entry is off-limits) — the deeper functional verification (list/create/update/delete users, wipe
participants, wipe-on-change policy, full participant→survey submission walkthrough) had already
been done directly against this same Supabase project earlier in the same session, before cutover,
so this final check is confirming *deployment*, not *correctness* — that was established already.

**Rollback, if ever needed**: delete `.env.production` and push (or revert commit `36824ef`) — the
GAS backend was never touched by any of this work and should still be fully functional. No data
migration undo is needed either way since Phase 3's migration script was one-directional and
additive (copied GAS data into Supabase, never deleted anything from Sheets).

### Real gap found and fixed right after cutover: survey-only launch links never routed through `isSupabaseBackend()` (2026-08-02)

Minutes after the cutover above, the user reported a real survey-only launch link
(`?survey_id=...&project=...&app=fb`, no `feed_id`) stuck on the loading skeleton in production.
Root cause turned out to be unrelated to the cutover itself, but real and worth its own entry:
**survey-only direct-launch boot/definition loads were never ported to Supabase at all in Phase
4** — each `App-*.jsx` had its own local, hardcoded `getSurveyBootFromBackendBySurveyId`/
`loadPublicSurveyDefinitionBySurveyId` pair (plus a `normalizeSurveyOnlyRuntimeBoot` helper in
`App-facebook.jsx`/`App-amazon.jsx`, not present in `App-instagram.jsx` — a pre-existing
inconsistency between the three, harmless since the call sites already re-derive everything it
touched), which fetched `GS_ENDPOINT` directly and completely bypassed the `isSupabaseBackend()`
switch every other backend call in this app goes through. This is a second instance of the
near-duplicate-`App-*.jsx` footgun documented at the top of this file — a fix landing in one file
and needing the same check in the other two.

The reported symptom (`getSurveyBootFromBackendBySurveyId failed: Error: HTTP 500`, then a
silently-swallowed `.catch(() => null)` leaving the UI stuck loading forever with no visible error)
was actually a **transient GAS error**, confirmed by calling the same GAS endpoint directly
immediately after and getting a clean `200` — so this specific incident would have resolved itself
on a page reload regardless of the gap below. But the gap itself was real: as long as this path
stayed hardcoded to GAS, every survey-only study would keep depending on GAS's uptime/latency
indefinitely, even with the rest of the app now on Supabase — directly contradicting the user's
explicit goal of "everything faster, only possible with everything Supabase."

**Fixed by deleting, not reimplementing**: `utils-backend.js` already had fully backend-agnostic
equivalents doing exactly this — `getSurveyBootFromBackend(surveyId, {projectId, signal})` and
`getSurveyFromBackend(surveyId, {projectId, signal, force})` — built during Phase 4 but never
actually called from anywhere in survey-only mode; the boot one was used by nothing, the definition
one was only used via the feed-linked path (`getSurveyForFeedFromBackend`). Confirmed return-shape
parity before swapping (both produce the same `makeEmptySurveyShell`-based normalized shape the
feed-linked path already produces, and the call sites' own `isSurveyOnlyDeliveryMode(...)` branches
already re-derive `trigger`/`linked_feed_ids`/`feed_sequence_ids`/`preferred_feed_id` for
survey-only mode independently of whatever the boot response contained — so the local
`normalizeSurveyOnlyRuntimeBoot` was fully redundant, not just replaceable). In each of the three
`App-*.jsx` files: deleted the local `buildBackendQueryUrl`/`fetchJsonWithTimeout`/
`getSurveyBootFromBackendBySurveyId`/`loadPublicSurveyDefinitionBySurveyId`/
`normalizeSurveyOnlyRuntimeBoot` functions entirely (confirmed unused elsewhere first), added
`getSurveyBootFromBackend`/`getSurveyFromBackend` to each file's import from `./utils`, and swapped
the two call sites. `GS_ENDPOINT` itself stays imported in all three — still used elsewhere
(non-survey-only code, e.g. debug/telemetry payloads).

**Verified**: all three files parse clean (`@babel/parser`). Loaded the exact real production
survey/project (`survey_t9919ylm52omnt277u3` / `project_1`, a live UWA-ethics-approved study) via
`localhost:5173` in `VITE_BACKEND=supabase` mode — despite this survey's `surveys.status` being
`"draft"` in the Supabase copy (nothing in the participant-facing path gates on `status`, confirmed
by grep — worth a separate look at *why* it's draft there, unrelated to this fix), it loaded the
correct real preface content, advanced through to the real Consent page (confirming the actual
survey definition/pages materialized correctly, not just the boot/preface stub), zero console
errors. Did not actually consent/submit — this is a real study's live data, not a throwaway test
fixture.

### Real production data-completeness incident: `posts.id` primary-key collision, found and fixed same day (2026-08-02)

Minutes after the survey-only fix above, the user reported the admin dashboard showing **zero
posts** for a real feed (`project_1`, "Feed 1 - G1 (Revised)") that clearly had posts before.
Investigation escalated well past that one feed — this section documents the full incident since
it's the most severe issue found in this whole migration.

**Scope, once actually measured**: not one feed. **46 of 56 feeds across every single project**
had a real, non-empty `feeds.checksum` (proof they'd genuinely been published with content in GAS)
but **zero rows in `public.posts`**. Confirmed via a direct GAS call that the real posts still
existed at the source (multiple full posts returned for the reported feed) — nothing was lost in
GAS, only in the Supabase copy. Since production had already been cut over to Supabase minutes
earlier, **any participant loading almost any feed at that moment would have seen an empty feed**.
Confirmed with the user first that no study was actively collecting before doing anything further
(worth re-confirming in any future incident like this — it's the deciding factor between "fix
forward" and "roll back to GAS immediately").

**Root cause: a second, undiscovered instance of the exact bug `20260801000011_fix_feed_id_collisions.sql`
already fixed once, one level deeper.** That migration's own comment explains the shape exactly:
real GAS-generated ids are only unique *within* whatever scope they were created in, not globally —
true for `feed_id` (fixed in 011), and it turns out equally true for post ids
(`"5f6ae9w22tumg95r8lj"` etc.), which are only unique *within the feed a post was created in*.
Confirmed directly: the same post id, with identical content, appears across many genuinely
different feeds — and even different *projects* — because these real studies are built by
duplicating a template feed into "Control"/"Treatment 1"/"Treatment 2"/... variants, which keeps
every shared base post's id identical across all of them. With `posts.id` as a bare `text primary
key`, Phase 3's migration script upserted feed after feed sequentially; every subsequent feed
sharing an id with an earlier one silently **re-pointed that row's `feed_id`** (upsert treats a
primary-key collision as an update, not a rejected conflict), stealing it away and leaving the
earlier feed at zero posts. This is precisely what "no posts in admin dashboard" was.

**Fix — mirrors `20260801000011` exactly, one layer down, but as an in-place repair, not a
truncate-and-redo** (that migration could safely wipe-and-redo because nothing was live yet at the
time; this table now holds real production data, so a full wipe was never an option here):
- **`20260801000013_fix_post_id_collisions.sql`**: added `posts.post_id` (the bare original id,
  preserved), then recomposed `posts.id` (the actual primary key) as `"<feed_id>::<post_id>"` —
  `feed_id` already being the composed `<project>::<app>::<feed>` key, so the combination is
  guaranteed unique. Safe to do as a live in-place `update` because the table held only 65 rows at
  the time (the two feeds that happened to survive Phase 3 uncollided), confirmed zero pre-existing
  duplicate ids before running it.
- **Every place that maps a post in either direction updated to match**, same asymmetry
  `feeds.id`/`feeds.feed_id` already established: `mapPostRowToRaw` (read side,
  `utils-backend-supabase.js`) now returns `post_id` as `raw.id` to the frontend, never the
  internal composed id. `mapRawPostToRow` (write side — this is the **live path every real
  "Save"/"Publish" in the admin dashboard goes through**, not just historical migration — fixing
  only the historical data and leaving this unfixed would have let the exact same bug recur on the
  next admin edit) now composes `id` the same way. `mapPost()` in
  `supabase/scripts/migrate-from-sheets.mjs` updated identically, for any future re-run.
- **A second, unrelated schema gap found while re-fetching the missing posts from GAS**:
  `posts.ad_type`'s check constraint only allowed `('none', 'ad', 'news')` — Instagram's post
  editor has a fourth real option, `"influencer"` ("Influencer Partnership",
  `components-admin-editor-instagram.jsx`, actively rendered by
  `ui-posts-instagram.jsx`), which the original Phase 1 schema comment's stated source
  ("Facebook has the largest field set") never accounted for since Facebook doesn't have this
  option at all. Fixed in `20260801000014_fix_ad_type_check.sql`. Worth remembering: the Phase 1
  schema's field/constraint inventory was reconstructed from reading editor components, not from
  live data — exactly the kind of gap that stays invisible until real data with real variety
  actually flows through it, same lesson as the id-collision bug above.
- **Data repair**: no service-role key or Edge Function needed — `path=posts`/`path=feeds` on the
  live GAS endpoint are public, unauthenticated GETs (same ones real participants' browsers already
  call), so a throwaway local script (not committed — one-off, scratchpad-only) re-fetched all 46
  affected feeds' real posts directly from GAS, mapped them with the exact same fixed logic as
  `mapPost()`, and bulk-upserted via `jsonb_to_recordset` through `supabase db query --linked -f`
  (no Supabase client library or service-role key needed for the write side either — the CLI's own
  authenticated connection handled it). 425 posts recovered across 45 feeds on the first pass; one
  feed (`proj_6/fb/feed_6`) hit the same transient-GAS-500 pattern documented earlier in this file
  and succeeded on a retry with backoff.

**Verified**: post-count audit re-run across every project — 0 of 56 feeds with zero posts,
down from 46. `select count(*), count(distinct id)` on the whole table: 490 total, 490 distinct —
no collisions. Read path re-tested against the exact originally-reported feed through the running
app's own `loadPostsFromBackend`: 20 posts, correct bare `id` (not the internal composed one).
Write path (`mapRawPostToRow`) verified two ways: end-to-end through `savePostsToBackend` wasn't
possible (the browser's admin session had expired and re-logging in wasn't available — RLS
correctly rejected the unauthenticated write, not a bug), so instead directly replicated the exact
row shape `mapRawPostToRow` produces via `supabase db query --linked` for two disposable feeds
deliberately sharing a post id — both kept independent, correctly-scoped rows, confirming the fix
holds for the exact real-world scenario (shared template posts across Control/Treatment-style
feed variants) that caused the original incident. Cleaned up all disposable test data afterward.

### Two more unported functions found by asking "why does X still work?" (2026-08-02)

Prompted by the user noticing survey post reminders still displayed correctly and asking why,
given everything above — good instinct, since by this point in the day "still works" had already
turned out twice to mean "never touched Supabase, still silently running on GAS," not "verified
working." Audited `utils-backend.js` for every exported function that talks to a backend but has
no `isSupabaseBackend()` branch at all. Two real hits (a third, `loadMergedParticipantSurveyRoster`,
was already known-dead-code per the "Experiment group missing from survey CSV export" entry above;
a fourth grep match, `invalidateSurveysCache`, was a false positive — pure local cache bookkeeping,
no network call).

- **`loadPostByIdFromBackend`** (survey `post_reminder` questions — CLAUDE.md's "Survey/posts
  loading performance fixes" `preloadSurveyPostReminders` entry already documents the caller side
  of this) — always called GAS's `POST_BY_ID_GET_URL` directly. Harmless today (GAS still has
  correct data, nothing was lost there), but silently contradicted the "everything faster, only
  possible with everything Supabase" goal stated earlier in this session.
- **`linkSurveyToFeedsOnBackend`** ("Save feed links" button in the survey editor,
  `components-admin-surveys.jsx`'s `handleSaveFeedLinks`) — **not just unported, actively broken**
  under `VITE_BACKEND=supabase`: it POSTs `admin_token` to GAS's `link_survey_to_feed`/
  `unlink_survey_from_feed` actions, but in Supabase mode `admin_token` holds a Supabase JWT, which
  Code.gs has no way to recognize as valid. This one needed a real design decision, not a
  mechanical swap: GAS models linking as direct per-feed link/unlink actions against a FeedSurveys
  sheet, independent of saving the survey itself; Supabase instead derives `feed_surveys` purely
  from `definition.feed_sequence_ids` (see `save-survey/index.ts`, Phase 2) — the join table is
  never hand-edited anywhere else. Fixing only the join table without also updating
  `definition.feed_sequence_ids`/`linked_feed_ids` would have created a footgun: the next plain
  "Save survey" (which re-derives `feed_surveys` from the possibly-stale `definition` on every
  save) would silently revert whatever "Save feed links" had just done. `supabaseLinkSurveyToFeeds`
  (`utils-backend-supabase.js`) writes both — diffs and updates `feed_surveys` directly (not a full
  delete+reinsert, so this stays a lightweight standalone action rather than a full survey
  re-save/re-sanitize through the Edge Function) and syncs `definition.feed_sequence_ids`/
  `linked_feed_ids` on the survey row to match.
- **`supabaseLoadPostById`** added alongside — feed-scoped lookup (`feed_id` + `post_id`, the same
  pair the new unique index from the collision fix above enforces), so it can't return the wrong
  feed's copy of a shared post id even though the underlying bare id is no longer unique on its own.

**Verified**: both files parse clean. `loadPostByIdFromBackend` tested against the real, live,
previously-broken feed (`project_1`/`feed_1_rev`) — correct post returned with the correct bare
id; also tested the exact disambiguation case that matters (same post id requested for two
different real feeds sharing it, both resolved independently and correctly). `linkSurveyToFeedsOnBackend`
couldn't be tested end-to-end for the same reason as the write-path test above (no live admin
session available) — instead directly replicated `supabaseLinkSurveyToFeeds`'s exact operation
sequence via `supabase db query --linked` against disposable data: linked a survey to feed A,
confirmed both `feed_surveys` and `definition.feed_sequence_ids` updated correctly; relinked to
feed B, confirmed feed A was cleanly removed from both and feed B correctly added to both. Cleaned
up afterward.

### Full-codebase audit for hardcoded GAS calls (2026-08-02) — one more real gap found, this time inside an admin component, not `App-*.jsx`

Given the pattern above kept recurring, did a systematic sweep rather than waiting for the next one
to surface by accident: grepped the whole `src/` tree for every raw `fetch(`, `GS_ENDPOINT`,
`GAS_PROXY_BASE`, `postJson(`, and `getJsonWithRetry(` usage outside `utils-backend.js`/
`utils-backend-supabase.js`, plus every exported function *inside* `utils-backend.js` that talks to
a backend at all but has no `isSupabaseBackend()` branch. Found one more real gap (beyond the two
already fixed this session) — this time not in the `App-*.jsx` files, but three functions defined
locally inside **`components-admin-dashboard.jsx`** itself, bypassing `utils-backend.js` entirely:

- **`getFeedFlagsFromBackend`** — turned out to be a pure duplicate of the already-ported
  `fetchFeedFlags` (identical normalized return shape), just never actually calling it. Not ported,
  **deleted** — its one call site now calls the imported `fetchFeedFlags` directly.
- **`setFeedFlagsOnBackend`** (every "Randomize times/avatars/names/images/bios" toggle in the
  Feeds table) — **had no Supabase counterpart anywhere**, not even an unused one. This was
  silently non-functional under `VITE_BACKEND=supabase`, full stop — worse than "still on GAS,"
  since GAS's own copy of these flags would just silently drift from whatever an admin thought
  they'd toggled. The trickiest part of porting this one: the toggle only ever sends a **single-key
  patch** (`{random_avatar: true}`, legacy naming) meant to update one flag and leave the rest
  alone, but `feeds.flags` stores the *canonical* `randomize_*` naming
  (`normalizeFlags()` in `migrate-from-sheets.mjs`) — a naive `{...existing, ...patch}` merge would
  leave both an old canonical key and a new legacy key sitting in the same object, and
  `normalizeFlagsForRead`'s `??` fallback would silently prefer the stale canonical one, making the
  toggle appear to do nothing. `supabaseSetFeedFlags` (`utils-backend-supabase.js`) resolves each of
  the 5 flags against *either* naming explicitly before merging, touching only what the patch
  actually mentions.
- **`fetchParticipantsStats`** (the Feeds table's Total/Submitted/Avg columns) — no Supabase
  counterpart existed; added one that computes the same three numbers over `participants` rows
  client-side (small per-feed row counts, same tradeoff already made for
  `loadExperimentGroupCounts` elsewhere in this file — no dedicated Postgres aggregate needed).

All three ported into `utils-backend.js` proper (not left local to one component) — `getAdminToken`/
`GS_ENDPOINT`/`normalizeFlagsForStore`/`normalizeFlagsForRead` imports removed from
`components-admin-dashboard.jsx` entirely once nothing there needed them anymore.

**Verified against real production data**: `fetchParticipantsStats('proj_7', 'feed_3')` (227 real
participants) returned `{total: 227, submitted: 227, avg_ms_enter_to_submit: null}` — cross-checked
the `null` average directly against the table (`count(ms_enter_to_submit)` = 0 of 227 rows) to
confirm it's a correct reflection of real data, not a query bug. `fetchFeedFlags` on the same real
feed returned real, non-default flag values. `setFeedFlagsOnBackend`'s merge logic
(the single-key-patch-against-canonical-storage problem above) unit-tested in isolation with both a
legacy-key and a canonical-key patch, confirming untouched flags survive and the patched one
applies; the actual jsonb write mechanics separately confirmed via `supabase db query --linked`
against disposable data. Full repo re-swept afterward for any remaining `GS_ENDPOINT`/raw-`fetch`
usage outside `utils-backend.js` — none found; the only remaining `GS_ENDPOINT` references
anywhere are the already-explained inert `endpoint` param on the properly-ported `fetchFeedFlags`
(ignored whenever `isSupabaseBackend()` is true) and this file's own definition.

**Audit conclusion**: as of this point, every backend-calling function in the app goes through
`isSupabaseBackend()` except one confirmed-dead one (`loadMergedParticipantSurveyRoster`, see the
Phase 4 "What's ported" section above). No further known gaps.

### What's ported (all behind `isSupabaseBackend()` checks in `utils-backend.js`)

- **New files**: `src/utils/utils-supabase-client.js` (lazy Supabase client singleton +
  `getBackendMode()`/`isSupabaseBackend()` reading `VITE_BACKEND`), `src/utils/
  utils-backend-supabase.js` (every Supabase-specific implementation — one-directional dependency,
  imported by `utils-backend.js`, never the other way, so there's no circular import between the
  two). `@supabase/supabase-js` added to the main app's `package.json` (separate from `supabase/
  scripts/package.json`'s own copy). `.env.example` (committed) documents `VITE_BACKEND`/
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`; the real `.env` is gitignored (confirmed via
  `git check-ignore`) and never leaves the machine it's created on.
- **Admin auth**: `adminLoginUser`/`adminLogout`/`touchAdminSession` → Supabase Auth
  (`signInWithPassword`, session stored through the *same* `setAdminSession()`/`getAdminRole()`/
  etc. localStorage helpers the GAS path already used, so every synchronous getter across the
  admin UI keeps working unchanged for both backends). `adminLogin` (the GAS-only shared
  owner-password scheme) returns an explicit "not available on Supabase" error rather than
  guessing, since Supabase Auth has no equivalent — every account, including the owner, is its own
  email+password user with a `profiles.role`.
- **Projects/Feeds/Posts**: full read+write — `listProjectsFromBackend`, `createProjectOnBackend`/
  `deleteProjectOnBackend`, `listFeedsFromBackend`, `deleteFeedOnBackend`, `loadPostsFromBackend`,
  `savePostsToBackend` (full-replace publish; also upserts the `feeds` row itself, since
  "+ New feed" in the admin UI is pure client-state until the first publish — there's no separate
  create-feed backend call to intercept).
- **Surveys**: `listSurveysFromBackend`, `loadSurveyFromBackend`, `saveSurveyToBackend` (via the
  `save-survey` Edge Function — see the bug fix below), `deleteSurveyOnBackend`,
  `deleteSurveyResponsesOnBackend`, `getLinkedFeedIdsForSurveyFromBackend` (replaced the GAS path's
  N-requests-per-feed lookup with one `feed_surveys` join query).
- **Participant-facing delivery**: `getSurveyForFeedFromBackend`/`getSurveyFromBackend`
  (`loadPublicSurveyDefinitionForFeed`/`loadPublicSurveyDefinition` under the hood),
  `getSurveyBootForFeedFromBackend`/`getSurveyBootFromBackend` (the lightweight preface/consent
  summary — derived by reading the same `surveys.definition` JSONB and computing `has_preface`/
  `preface.*` from whether the html fields are non-empty, since GAS's exact boolean logic isn't
  readable; same *contract*, not necessarily the same algorithm).
- **Experiment groups**: `assignExperimentGroup`/`resetExperimentGroupAssignments` call the
  Postgres RPC functions built in Phase 1 (`assign_experiment_group`/
  `reset_experiment_group_assignments`) directly — no Edge Function needed, these were already
  designed to be called from the client. `loadExperimentGroupCounts` fetches `group_id` rows and
  tallies client-side (no aggregate RPC exists; counts are small enough that this is fine).
- **Participant submission (writes)**: `sendToSheet`/`sendSurveyResponseToBackend` insert into
  `participants`/`survey_responses` via a direct `fetch(..., { keepalive: true })` against
  PostgREST (not the `supabase-js` client) — this is the modern, header-capable replacement for
  the existing `navigator.sendBeacon` pattern, which can't carry the `apikey` header PostgREST
  requires. Both tables are public-insert via RLS; no admin session involved, matching a real
  participant's anonymous browser.
- **Participants/CSV export rosters**: `loadParticipantsRoster`, `loadSurveyResponsesRoster`/
  `loadSurveyResponsesBySurveyRoster`, `loadSurveyParticipantsRoster`/`loadSurveyParticipantsStats`,
  `fetchFeedFlags`. The higher-level roster-merge functions (`loadSurveyOnlyRoster`,
  `loadMultiFeedParticipantSurveyRoster`) needed **zero changes** — they're pure client-side merges
  over the leaf functions above, not separate network calls.

**This list predates several things ported later the same day, after production cutover — see their
own sections below (all dated 2026-08-02, further down this file) rather than duplicating here**:
admin user management (`adminListUsers`/`Create`/`Update`/`DeleteUser`, via the `admin-users` Edge
Function), `wipeParticipantsOnBackend`, `getWipePolicyFromBackend`/`setWipePolicyOnBackend`
(project-scoped, a deliberate divergence from GAS's global flag), survey-only direct-launch boot/
definition loading (`getSurveyBootFromBackend`/`getSurveyFromBackend`, now actually called from
survey-only mode), `loadPostByIdFromBackend` (survey post-reminder questions),
`linkSurveyToFeedsOnBackend` ("Save feed links" button), and `setFeedFlagsOnBackend`/
`fetchParticipantsStats` (Feeds table randomize toggles + stats columns, found during the
full-codebase audit). **As of the full-codebase audit (2026-08-02), every backend-calling function
in the app goes through `isSupabaseBackend()` except one confirmed-dead one**
(`loadMergedParticipantSurveyRoster`) — treat the migration's frontend-wiring phase as complete,
not "mostly done."

### Real bug found and fixed: `save-survey` Edge Function's feed linking was broken

`supabase/functions/save-survey/index.ts` (built in Phase 2, before the feed_id-collision fix
below existed) inserted `feed_surveys` rows using bare feed ids (`"feed_1"`), but
`20260801000011_fix_feed_id_collisions.sql` (a Phase 3 fix, landed later) made `feeds.id` — and
therefore the FK `feed_surveys.feed_id` points at — a composed `<project_id>::<app>::<feed_id>`
key. The Edge Function was never updated for that. **Any survey save that linked feeds would have
failed with a foreign-key violation** — this had been live and broken since Phase 2, just never
exercised until Phase 4 actually called it. Fixed by adding `app` to the request body and
composing the key the same way everywhere else does; type-checked with `deno check` and
redeployed via `supabase functions deploy save-survey`.

### Known gap: no "default feed" concept in the Postgres schema

`getDefaultFeedFromBackend`/`setDefaultFeedOnBackend` (which feed the admin dashboard opens by
default for a project) has no column anywhere in the Phase 1–3 schema — it was never in the
original entity inventory. Rather than add a migration for what's purely an admin-dashboard
convenience (participants always get their feed_id from the launch link URL, never from this),
the Supabase path falls back to the same client-local `localStorage` pattern already used for
default *project* (`getDefaultProjectFromBackend`/`setDefaultProjectOnBackend`), scoped per
app+project. Real difference from the GAS behavior: it won't sync across the admin's different
browsers/machines. Worth a real column later if that turns out to matter.

### How this was verified

No click-through was possible for any earlier redesign in this file's history (sandbox `npm run
dev` was broken) — this is the first Phase-4-scale piece of work where real browser verification
happened, once the user fixed the quarantine issue (see "Build/dev notes"). Verification had two
layers:
1. **Disposable test data via the browser console** — created a throwaway project/feed/survey
   (with real experiment groups), exercised every ported function including the full
   assign-group → submit-participant → submit-response → CSV-roster pipeline, confirmed via direct
   `supabase db query --linked` SQL, then deleted it and confirmed zero orphaned rows across all 9
   related tables (cascade FKs did their job).
2. **An actual UI walkthrough as a participant** — navigated to a real feed URL, reacted to a post
   (❤️ Love), clicked Submit, answered the survey question, clicked Submit survey, landed on the
   correct custom "Thank you" message. Confirmed in the database that the *real* interaction-
   tracking payload (not a hand-built test payload) landed correctly — `uip1_reacted: 1,
   uip1_reaction_type: "love"`, per-post dwell times, the full displayed-posts snapshot, all
   matching the exact click made. This is a meaningfully stronger check than calling the backend
   functions directly from the console, which is all that had been done before being asked to go
   further — worth remembering for future sessions: a function returning the right shape when
   called directly doesn't prove the real component event-handler chain calls it the same way.

Also benchmarked: 5 sequential loads of the same real feed (15 posts) through each backend,
same machine, back to back. GAS: 10.4s cold, then 1.6–2.2s steady-state. Supabase: 600ms cold,
then 230–320ms steady-state — roughly 5–8x faster, consistent with the structural argument for
migrating in the first place (Apps Script's no-persistent-process cold-start cost, Sheets having
no real indexing). One sample, not a formal benchmark, but the gap is far bigger than normal
network noise.

**Found but not fixed, unrelated to this migration**: during the UI walkthrough, two console
errors fired at the feed→survey transition — `Cannot update a component (App) while rendering a
different component (PostCard)`. No `.jsx` file was touched anywhere in this Phase 4 session (only
`utils-backend.js`, `utils-backend-supabase.js`, `utils-supabase-client.js`, and the Edge
Function), so this is a pre-existing React race condition in component teardown/transition timing,
not a regression from the backend swap — likely masked previously by GAS's much slower response
times shifting render sequencing enough to avoid it. The flow still completed correctly. Worth a
dedicated look in a future session; deliberately not chased down as part of this one.

### Admin user management ported (2026-08-02)

`adminListUsers`/`adminCreateUser`/`adminUpdateUser`/`adminDeleteUser` (`utils-backend.js`) now
route to Supabase behind `isSupabaseBackend()`, same pattern as everything else in this section.
This was the one item flagged as needing "a design decision before porting, not just a mechanical
port" — Supabase Auth admin operations (create/disable/reset-password/delete) need the
`service_role` key, which must never reach the frontend, so it's a new Edge Function
(`supabase/functions/admin-users/index.ts`), not a direct client call, same shape as `save-survey`.

- **Authorization is enforced twice, deliberately redundantly**: the frontend only shows this UI
  to `hasAdminRole("owner")`, but the Edge Function independently re-checks the caller's
  `profiles.role === 'owner'` server-side (via the caller's own JWT, looked up with the
  service-role client) before doing anything — the frontend gate is UX only, not the real
  boundary, same reasoning as `save-survey`'s editor/owner check.
- **`action` dispatch, one function**: `{action: "list"|"create"|"update"|"delete", ...}` rather
  than four separate functions — matches how `utils-backend-supabase.js`'s `invokeAdminUsers()`
  wraps a single `supabase.functions.invoke("admin-users", {body: payload})` call per operation.
- **`create` relies on the existing `handle_new_auth_user` trigger** (`20260801000002_profiles.sql`)
  to insert the `profiles` row (defaults to role `'viewer'`) after `auth.admin.createUser()` — only
  issues a second write when a non-default role was requested, rather than inserting the profile
  itself and racing the trigger.
- **`delete` refuses to let an owner delete their own account** (checked against the caller's own
  JWT-derived email) — not a data-integrity concern (the `profiles.id → auth.users.id` FK already
  cascades cleanly either way), purely to stop an owner from locking themselves out of user
  management with nobody left to undo it. Deleting the auth user is sufficient; no separate
  `profiles` delete is needed, the cascade handles it.
- Type-checked with `deno check` and deployed via `supabase functions deploy admin-users`, same as
  `save-survey` before it.

**How this was verified — and a real testing-tool gotcha found along the way**: verified fully
live against the production Supabase project (list/create/update/delete), using a disposable
`+claude-verify@` subaddress of the real owner's own email as the throwaway test account (plain
`@example.com` addresses are rejected by Supabase Auth's email validator) rather than the owner's
real credentials, cleaned up afterward with zero rows left behind (confirmed via
`supabase db query --linked`). Along the way, the browser-automation tool's synthetic
ref-based/coordinate clicks landed on the right element (confirmed via `getBoundingClientRect()`)
but silently produced **no effect at all** — no request, no error, nothing — on this specific
panel's buttons, while calling the exact same `adminUpdateUser`/`adminListUsers` functions directly
(via a dynamic `import()` of the running app's own `utils-backend.js` in the page console) worked
immediately every time. Dispatching a real `button.click()` via `javascript_tool` also worked
immediately. Conclusion: this was a limitation of the click-simulation tooling in this environment
(React's synthetic event system not receiving whatever event type the automated click sent), not
a bug in the app — but worth remembering for future sessions: if a click-through verification shows
a button doing *nothing at all* (not erroring, not loading, literally inert) where the exact same
call works when invoked directly, suspect the tooling before suspecting the code, and confirm with
a direct `.click()` dispatch before concluding the app is broken. Also relevant: a same-origin
navigation that only changes the URL hash (`#/admin/...` → `#/admin/dashboard/users`) is a
same-document SPA route change, not a real page reload — it will *not* clear stale Vite HMR module
state from edits made earlier in the same session while the tab was open. A genuine
`location.reload()` is needed to rule that out, same lesson CLAUDE.md already had reason to note
about dev-server behavior elsewhere in this file.

### `wipeParticipantsOnBackend` ported (2026-08-02)

The per-feed "Wipe" button (owner-only, `components-admin-dashboard.jsx` Feeds toolbar) now
routes to Supabase behind `isSupabaseBackend()`. This one really was the mechanical port it looked
like — no service-role key needed, no Edge Function: `public.participants.feed_id` is already the
same composed `<project>::<app>::<feed>` key `feeds.id` uses, and the `participants_delete_editors`
RLS policy (`20260801000006_participants.sql`) already allows editor/owner deletes — added
`supabaseWipeParticipants({projectId, app, feedId})` in `utils-backend-supabase.js` (plain
`.delete().eq("feed_id", composedFeedId)`) and wired it into `wipeParticipantsOnBackend` in
`utils-backend.js`, same `isSupabaseBackend()`-branch-first pattern as every other ported function.
Deliberately scoped to *only* the participants table, matching GAS's `wipe_participants` action —
`survey_responses` for that feed's survey is untouched (that's the separate, already-ported
"Delete survey data" feature).

Verified live: inserted one disposable participant row for a throwaway project/feed/participant
(not any real study's data), called the real `wipeParticipantsOnBackend` through the running app's
own module in the browser console, confirmed the row was gone via `supabase db query --linked`,
then deleted the throwaway project/feed too — zero rows left behind. Didn't repeat a full UI
button click-through this time — the admin-users work already established that this panel's
`onClick` handlers behave identically to calling the underlying function directly (see above), so
that risk is already covered. **One new gotcha found while testing this**: a bare
`import('/src/utils/utils-backend.js')` from the page console can silently resolve to a
**pre-edit cached module instance** if that exact URL (no cache-busting query string) was already
imported earlier in the same session — it fails silently in a way that looks like a real bug (the
GAS fallback path runs instead, doing nothing and returning `false` with no error, since
Supabase-mode sessions have no `admin_token`). Fix is to append a cache-busting query string
(`?t=${Date.now()}`) on every fresh console-based verification import, not just the first one per
file per session.

### `getWipePolicyFromBackend`/`setWipePolicyOnBackend` ported — project-scoped, not global (2026-08-02)

**Deliberately diverges from GAS's shape.** GAS's `wipe_policy`/`set_wipe_policy` actions are a
single flag, global across the entire deployment, no project or feed scoping at all. Per direct
user request, the Supabase version scopes the policy **per project** instead — a project defaults
to off (publishing a checksum-changing feed never touches participant data unless a project
explicitly opts in), and turning it on for one project doesn't affect any other project's feeds.
Per-feed scoping within a project was considered and explicitly rejected by the user (would mean
re-toggling every feed individually for a many-feed project — e.g. `proj_6` alone has 13 feeds) in
favor of the simpler project-level toggle already surfaced in the UI.

- **New column**: `projects.wipe_on_change boolean not null default false`
  (`20260801000012_project_wipe_on_change.sql`). Applied directly via
  `supabase db query --linked -f <file>` — same non-`db push` process every prior migration in
  this project actually went through (confirmed via `supabase migration list --linked`: the
  remote migration-history table is empty even though all 11 prior migrations are live, meaning
  `db push`'s tracking was never used here — matching this file's process kept the sequence
  consistent instead of introducing a second, incompatible apply method). Purely additive; every
  existing project defaulted to `false`, confirmed via query post-apply.
- **`supabaseGetWipePolicy`/`supabaseSetWipePolicy`** (`utils-backend-supabase.js`) — plain reads/
  writes of that column, no Edge Function needed (same RLS-is-sufficient reasoning as
  `wipeParticipantsOnBackend`).
- **`supabasePublishPosts` now actually enforces the policy** — previously it didn't check any
  policy at all, so publishing on Supabase never wiped participants regardless of GAS-side
  expectations. Now reads the feed's *previous* checksum and the project's `wipe_on_change` in
  parallel before overwriting the feed row; wipes that feed's participants only if a previous
  checksum existed, it differs from the new one, *and* the project has opted in. A feed's first-
  ever publish (no previous checksum) is never wiped — there's nothing to invalidate yet.
- `getWipePolicyFromBackend`/`setWipePolicyOnBackend` (`utils-backend.js`) both gained an optional
  `projectId` (defaulting to `getProjectId()`, same convention as every other project-scoped
  function in this file) — additive, existing call sites in `components-admin-dashboard.jsx`
  needed no changes.

**Verified live**, all four cases, against a disposable throwaway project (not any real study),
using the running app's own module via cache-busted console imports (`?t=${Date.now()}` — see the
gotcha noted just above): (1) first publish never wipes, (2) policy off + checksum change → survives,
(3) policy on + checksum change → wiped, (4) policy on + **unchanged** checksum → still survives
(confirms it's keyed on an actual content change, not just the policy being on). Cleaned up with
zero rows left behind afterward.
- ~~Video upload (`uploadVideoToBackend`, still Drive-based) — not started.~~ **Wrong, corrected
  2026-08-02**: media upload (images and video, across all three post editors) already goes
  through AWS S3 directly from the browser — `uploadFileToS3ViaSigner`/`getPresignedPutUrl`/
  `putToS3` in `utils-backend.js`, hitting a presigned-URL Lambda behind API Gateway
  (`qkbi313c2i.execute-api.us-west-1.amazonaws.com`) and a CloudFront CDN (`CF_BASE`) — not GAS,
  not Drive, and out of scope for this migration entirely (it was never Sheets-backed). Confirmed
  by finding every real call site (`components-admin-media-facebook.jsx`,
  `-instagram.jsx`, `components-admin-editor-{facebook,instagram}.jsx`) all use
  `uploadFileToS3ViaSigner`. `uploadVideoToBackend` (the function this note was actually about) is
  a **separate, dead legacy function** — zero callers anywhere in the repo, not even re-exported
  from `src/utils/index.js` — that points at a nonexistent `localhost:4000` local dev signer and
  was never wired to any UI. `DRIVE_RE`/`injectVideoPreload`/`primeVideoCache` (`utils-core.js`)
  are unrelated: that's read-side backward-compat (skip preload/cache-priming for any old post
  that still happens to have a real Google Drive video URL from before S3), not an upload path.
  Left `uploadVideoToBackend` in place rather than deleting it unprompted — flagging as safe,
  confirmed-unused cleanup for whenever the user wants it gone.
- `loadMergedParticipantSurveyRoster` — confirmed **dead code** (nothing in the app calls it, per
  the "Experiment group missing from survey CSV export" note above), so its inline GAS
  `FEED_SURVEY_GET_URL` call was deliberately left unported rather than spending effort on
  something unused.

**Key safety decision, worth restating here since it governs how *any* future session should do
this work**: build the new backend integration as inert code behind a feature flag that defaults
to the current GAS backend, rather than relying on git-branch isolation. The mechanism that
auto-commits/auto-deploys this repo (see "Deployment" section up top) is external to Claude's own
tool calls and not fully understood — flag-gating is the only safety guarantee that doesn't
depend on knowing what that pipeline actually watches. Testing happens via the *user's own* local
`npm run dev` (now confirmed working, see "Build/dev notes") rather than a deployed staging
environment.

## Survey post-reminder flash of unrandomized content, fixed (2026-08-02)

User-reported: on the survey "Loading questions…" page, `post_reminder` questions would render
correctly for a moment, then visibly flip — the avatar/post image would show grey/blank before
popping in, and worse, for posts with `randomize_times` on, the reminder would flash the raw
literal `"Just now"` before switching to the properly randomized `"Xh"` time a beat later.

**Root cause**: `PostReminderCard` (`src/ui-core/ui-survey.jsx`) fetches its source feed's
randomize flags itself, via `fetchFeedFlags`, in a `useEffect` that only runs once the survey page
has already mounted — i.e. after the "Loading questions…" overlay is gone and the participant is
already looking at the page. Until that fetch resolves, the reminder renders with
`reminderFlags` still `null`, falling back to the outer (usually all-false) survey `flags` prop —
so `randomize_times`/`randomize_avatars`/`randomize_images` all read as off on first paint,
producing the raw unrandomized post fields (raw `post.time`, which commonly defaults to literally
`"Just now"`; the unrandomized avatar/image) until the flags fetch resolves and the component
re-renders. `preloadSurveyPostReminders` (duplicated per `App-*.jsx`, called during the loading
overlay) already existed specifically to warm this kind of thing, but only warmed the post itself
and its literal image fields, plus (fb/ig only) one deterministic avatar-pool pick — it never
fetched feed flags at all, and had no equivalent preload for `randomize_images`.

**Fix — cache priming only, no render-logic changes**: exported `PostReminderCard`'s two
module-level caches (`reminderPostFetchCache`, `reminderFlagsFetchCache`) and its
feed-id/app-resolution helpers (`getReminderPostFeedId`, `getReminderApp`) from `ui-survey.jsx`,
then had each `App-*.jsx`'s `preloadSurveyPostReminders` populate them *before* the survey page
ever mounts, keyed identically to how `PostReminderCard` reads them
(`${projectId}::${feedId}` / `${projectId}::${feedId}::${postId}`) — so `PostReminderCard`'s
`useState` initializers find already-correct data on the very first render instead of starting
`null` and flipping later. Specifically, per reminder target: fetch+cache the feed's flags
up front (fb/ig); only if `randomize_avatars` is actually on, preload the deterministic avatar
pick (previously always done regardless of the flag); **new** — if `randomize_images` is on,
compute and preload the deterministic pool image pick too (mirroring each app's own PostCard
internal seed shape exactly — Facebook/Instagram's `[...seedParts, "image"]`), closing the one
genuine gap where an asset was never preloaded at all, not just fetched late. Amazon has no
time/avatar/image randomization (confirmed via grep — `ui-posts-amazon.jsx` has none of this), so
it only got the (harmless, minor) post-cache priming for parity, not the flags/avatar/image work.

Getting the cache keys to line up required reusing `getReminderPostFeedId` (not the preload
functions' own simpler feed-id fallback chain, which omitted the `visible_in_feeds` fallback
`PostReminderCard` also checks) and `getReminderApp` (not each app's own `APP` constant — for
Amazon specifically, `getReminderApp()` only ever returns `"fb"`/`"ig"`, never `"amz"`, a
pre-existing quirk of `PostReminderCard`'s app resolution unrelated to this fix and not touched
here; using anything else would have broken cache-key parity between preload and render).

**Not click-tested live** — same sandbox `npm run dev`/`build` limitation as elsewhere in this
file; verified via the `@babel/parser` syntax-check workaround only (all four changed files parse
clean: `ui-survey.jsx`, `App-facebook.jsx`, `App-instagram.jsx`, `App-amazon.jsx`). Worth a real
click-through on a survey with a `randomize_times`/`randomize_images`-enabled reminder post once
this deploys, to confirm the flash is actually gone and not just theoretically fixed.

## Avatar/topic-image assets were serving full-camera-resolution files (2026-08-02)

Follow-up to the reminder-post flash fix above: even after that preload fix, the user still saw
a visible grey-circle delay before avatars appeared. Root cause turned out to be nothing to do
with preload timing or code at all — it was the actual asset files. The avatar pool
(`d2bihrgvtn9bga.cloudfront.net/avatars/{female,male}/*.jpg`, backed by S3 bucket
`my-video-feed`, us-west-1, CloudFront distribution `ERUJLWKVJDMDM`) was storing raw
phone/camera-resolution originals — confirmed via direct fetch: `f10.jpg` was 2832×4064px/644KB,
`f1.jpg` 5184×3456px/858KB, `m1.jpg` 4000×5688px/1.15MB — being downloaded in full just to render
a ~40px avatar circle. The `images/<topic>/` content-image pool used by `randomize_images` (same
bucket, 20 real topic folders identified by having an `index.json` — Airlines, Animals, Apple,
Bottle, Cinema, Climate Change, Education, Immigration, Mental Health, Multivitamins, Packaging,
Rain, Social Media, Starbucks, Stocks, Sunscreen, Traffic, Transport, Vaccines, Water; the
`global` folder and every project/feed-named folder under `images/` do *not* have an
`index.json` and are unrelated raw per-post uploads via the S3 presigned-URL signer, not part of
this pool — left untouched) had the same problem, worse in aggregate (321MB across 194 files).

**Fixed by resizing in place, not by touching any code.** Since the frontend just fetches
whatever bytes live at each pool URL (`getAvatarPool`/`getImagePool` in `utils-core.js`), the fix
was entirely asset-side: download → resize with macOS's built-in `sips` (no ImageMagick/sharp
available or needed) → re-upload to the *same* S3 keys → CloudFront invalidation. No manifest or
app-code changes required.
- **Avatars**: `-Z 320 -s formatOptions 78` (max 320px dimension, quality 78) — chosen for a small
  circular thumbnail; visually verified sharp at that size. Female 35MB→416KB, male 28MB→428KB
  (~65-84x). Company avatars (`avatars/company/*.png`) were already fine (7-24KB logos) and left
  alone.
- **Topic images**: `-Z 1400` (quality 80) — deliberately much bigger than avatars since these
  render as full post-width images (`--feed-max: 700px` in all three stylesheets, so 1400px
  covers 2x/retina). 321MB→38MB (~8.4x). **Not every file was touched** — only resized when a
  file's actual pixel dimensions exceeded 1400px; discovered via a failed first attempt that
  blindly running `sips -Z` on an already-small file *upscales* it and can make the file bigger
  (a 638×480/34KB test file became 1400×1053/230KB) — so the working script checks
  `pixelWidth`/`pixelHeight` per file first and skips ones already under the target (5 of 194,
  all in `Bottle/`, were skipped this way).
- **Backup before touching anything**: bucket has no versioning enabled
  (`aws s3api get-bucket-versioning` returned empty), so every original was `s3 sync`'d to
  `avatars_originals_backup_2026-08-02/` / `images_originals_backup_2026-08-02/` in the same
  bucket before any overwrite — that's the actual undo path if a resize ever needs reverting.
- **CloudFront invalidation gotchas hit along the way**: (1) a single `create-invalidation` call
  with ~19 wildcard (`/topic/*`) paths hit `TooManyInvalidationsInProgress` — CloudFront caps
  in-progress *wildcard* invalidation paths per distribution well below that; switched to
  invalidating the exact touched file paths instead (189 individual paths, no wildcards — also
  more precise, since it skips `index.json` which was never touched). (2) CloudFront invalidation
  paths need literal spaces URL-encoded (`%20`) — folder names like `Climate Change`/
  `Social Media`/`Mental Health` failed with `InvalidArgument` until fixed. (3) macOS's default
  `/bin/bash` is 3.2 (no `mapfile` builtin) — array-from-file needs a `while read` loop instead.
- **One real mistake made and cleaned up**: an `aws s3 sync` download step left a spurious local
  duplicate (`Rain5.jpg.3Afa1456`, a mangled-colon artifact — not a real original object, confirmed
  by checking the backup, which only ever had the 5 real `Rain*.jpg` files) that got swept into
  the same resize-everything loop and uploaded as a genuine extra S3 object. Harmless functionally
  (the app sources its image lists from `index.json`, never from raw folder listing, so it was
  never reachable), but deleted (`aws s3 rm`) once noticed rather than left as clutter.
- **Execution mechanics worth remembering for next time**: this session had no AWS CLI or
  credentials configured at first (`brew install awscli`, then the user ran `aws login`
  themselves — SSO browser flow, landed on `arn:aws:iam::044469163119:root`, region defaulted to
  us-east-1 but the bucket is us-west-1 so every command needs an explicit `--region us-west-1`).
  **Live S3/CloudFront write commands (`aws s3 cp`, `create-invalidation`) are gated by Claude
  Code's auto-mode permission classifier** and get blocked unpredictably — one `aws s3 cp` call
  was blocked, then an identical one moments later went through when shown to the user as part of
  demonstrating the command. Given the user's explicitly stated preference (run risky write
  commands themselves rather than have Claude execute them silently), the working pattern that
  actually stuck was: Claude does all the read-only prep (download, backup *is* a write but to a
  new prefix so lower-risk, resize, verify) and writes a shell script to the scratchpad dir, hands
  the user the exact `bash <script>` command to run themselves — except when the user explicitly
  says "just do it", which is direct authorization to run it directly.
- **Verified end-to-end**: fetched several live post-fix URLs directly with cache-busting
  (`?bust=<ts>` + `cache:'no-store'`) to bypass both browser and edge cache and confirm the actual
  current bytes being served, not a stale cached read — e.g. `mentalhealth11.jpg` now 409KB (was
  multi-MB), `Transport3.jpg` 788KB, deleted stray file now correctly 403s.
- **Not addressed**: the raw per-post-upload images under `images/<project>/<feed>/...` (285
  files across all of `images/`, minus the 194 in real topic pools — includes a couple of 2.5MB
  PNGs) — these are specific, deliberately-chosen images for specific posts, not a randomization
  pool, so blanket-resizing them wasn't in scope here and needs a case-by-case call (some may be
  intentionally high-res, e.g. a screenshot post where legibility matters).

## Build/dev notes

- `npm run dev` — Vite dev server. **Currently hangs indefinitely at startup in this
  environment** (confirmed by running it directly, with a cleared `node_modules/.vite` cache,
  and via the browser-preview tooling — all hang the same way, never printing the "Local:
  http://..." banner; reconfirmed 2026-08-01, several attempts across a long session, no
  change). This is purely a limitation of Claude's sandbox — the external pipeline that builds
  and deploys `main` to production (see "Deployment" section up top) clearly does not hit this,
  since pushed changes do go live. Same underlying class of issue as the `npm run build` problem
  below
  (macOS code-signing/Gatekeeper blocking a native binary Vite needs at startup), just now also
  blocking dev, not only build. Not caused by any app code change.
- `npm run build` — **currently broken in this environment**: `@rollup/rollup-darwin-arm64`
  native binary is blocked by macOS code-signing policy (unrelated to any app code).
- **Syntax-checking workaround, updated**: the previously-documented `esbuild --bundle=false`
  per-file check **no longer works either** — `esbuild`'s own native binary got quarantined too
  (`com.apple.quarantine` xattr; `codesign -dv` shows `adhoc,linker-signed`). **What does work**:
  `@babel/parser` is a pure-JS package already present as a transitive dependency (no native
  binary at all), so it's immune to this whole class of problem. Syntax-check any `.jsx`/`.js`
  file with:
  ```js
  const parser = require("<repo>/node_modules/@babel/parser");
  parser.parse(fs.readFileSync(file, "utf8"), { sourceType: "module", plugins: ["jsx"] });
  ```
  This catches real syntax errors (unbalanced JSX, bad braces, etc.) but — as the admin redesign
  proved — it cannot catch logic/behavior bugs like relative-vs-absolute route paths. It's a
  syntax check, not a replacement for actually running the app.
- If the quarantine issue itself needs fixing (to get a real dev server or build working again):
  `xattr -d com.apple.quarantine ./node_modules/esbuild/bin/esbuild` (and the equivalent for
  rollup's binary under `node_modules/@rollup/`). Claude has not run this — it's a security-setting
  change and needs to be run by the user. **Confirmed fixed this way, 2026-08-02**: the quarantine
  flag turned out to be applied broadly (3,987 files under `node_modules`, not just these two), so
  chasing individual binaries kept surfacing new "Not Opened" Gatekeeper dialogs (`fsevents.node`
  was the next one, via chokidar/Vite's file watcher). One recursive sweep fixed it for good:
  `xattr -dr com.apple.quarantine node_modules` — the user ran this in their own terminal and
  `npm run dev` started cleanly afterward (`VITE v7.1.3 ready`). Still needs to be run by the user,
  not Claude, for the same security-setting reason as above; this just documents the working fix
  instead of the per-binary guess.
- No test suite exists in this repo.

## Repo hygiene note: `node_modules/` is tracked in git

`.gitignore` does not exclude `node_modules/` — roughly 3,500 files under it are committed to
this repo. This means routine cache-clearing commands like `rm -rf node_modules/.vite` (a normal,
harmless thing to do when debugging a stuck dev server — the cache regenerates automatically)
show up as real, committable file changes instead of being invisible/ignored like in a normal
JS repo. Worth fixing (`git rm -r --cached node_modules && echo node_modules >> .gitignore`) at
some point, but that's a repo-hygiene call for the user to make, not something to do unprompted.

## One-off incident: CLAUDE.md itself got deleted mid-session (2026-08-01)

During the admin dashboard redesign work, this file was found deleted from the working directory
(not modified — gone) partway through a session, with no corresponding edit/delete tool call to
explain it. It was recovered with `git checkout HEAD -- CLAUDE.md` (it was committed and clean at
the time, so nothing was lost). Cause unknown — happened in the same window as several `npm run
dev` attempts and one `rm -rf node_modules/.vite`, but no causal link was established. Mentioning
this so that if a repo file mysteriously vanishes again, it's known to have happened once before
and `git checkout HEAD -- <file>` is the fix if the file was committed.
