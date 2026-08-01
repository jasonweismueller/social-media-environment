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
  change and needs to be run by the user.
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
