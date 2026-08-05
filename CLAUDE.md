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

**Superseded 2026-08-05 for production specifically** — see "Staging environment added
(2026-08-05)" below. `main` still behaves exactly as described above (auto-commit, auto-push,
now auto-deploys to a Netlify *staging* site), but `studyfeed.org` itself no longer redeploys on
every push to `main` — it now requires a deliberate promotion step. The "no staging buffer, a
file edit is very likely a production change" framing above is still correct for *staging*, just
no longer for production.

## Staging environment added (2026-08-05)

Per direct request, after `main` → `studyfeed.org` direct-to-production deploys had been the
norm since this repo existed (see "Deployment" above) — added a real gate.

**New flow**:
- `main` — unchanged in every way except where it deploys. Same auto-commit/auto-push behavior,
  same "an edit here is live within the session" immediacy — just now live on a **Netlify
  staging site**, not `studyfeed.org`. Netlify project connected directly to this GitHub repo,
  builds `main` with `npm run build` → publishes `dist`, same build as production's own pipeline.
- `production` branch (new) — `studyfeed.org` (GitHub Pages, `.github/workflows/deploy.yml`) now
  only redeploys on a push to **`production`**, not `main` (`branches: [main]` →
  `branches: [production]` in the workflow file). **To actually ship a change**: merge/fast-forward
  `main` into `production` and push `production` — that push is what triggers the real deploy.
  Until that happens, `studyfeed.org` keeps serving whatever `production` last pointed at,
  regardless of how far ahead `main` is.

**Status, 2026-08-05**: workflow file changed and committed (`f32e4be`) on `main`; a local
`production` branch created pointing at that same commit (so its own copy of the workflow
already has the new trigger). **Neither has been pushed to `origin` yet** — Claude's git push
failed in this sandbox (`fatal: could not read Username for 'https://github.com'` — no working
push credential here, `gh auth status` also shows an invalid token), matching this repo's
existing established pattern that pushes happen via the user's own authenticated GitHub Desktop
app, not from Claude's sandbox. **Until both `main` and `production` are pushed, nothing above is
actually live** — `origin/production` doesn't exist yet, so GitHub Pages is still deploying
however it did before this change (i.e. still effectively `main`-triggered until the old workflow
run history ages out and the new branch/trigger actually exists on GitHub).

**Update 2026-08-05, later same day**: `main` and `production` are now both pushed to `origin`
(confirmed via `git branch -vv`/`git ls-remote` — both track `origin/main`/`origin/production`,
presumably pushed via the user's GitHub Desktop app at some point after the note below was
written; not something Claude did). So the "not yet done" list below is stale on its first bullet
— leaving the rest in place since it's still accurate.

**Update 2026-08-05, later still**: the first real promotion *has* now happened — the user merged
`main` into `production` and pushed (confirmed via `git log`/`git ls-remote`: `production` was at
commit `7244dc6`, a descendant of the "analysis hub, amazon improvement, data quality" commit), and
GitHub Actions' "Deploy to GitHub Pages" workflow ran against that push and completed successfully
(confirmed via the public Actions API, no auth needed since the repo is public). So `studyfeed.org`
should be serving that commit. **The Netlify site itself is also now identified** — user confirmed
via screenshot: name `effervescent-trifle-c6afbc`, live at
`https://effervescent-trifle-c6afbc.netlify.app`, Project configuration → Build & deploy →
Continuous deployment confirms it's linked to this repo's GitHub source. (Netlify has since renamed
"Site settings" to **"Project configuration"** — worth knowing if a future session or the user goes
looking for the old name and can't find it.) Custom-domain (`staging.studyfeed.org`) and environment
-variable setup (see below) were pointed out as the next manual steps but not confirmed done as of
this note — check Project configuration → Domain management / Environment variables before assuming
either is still outstanding.

**Still not done, needs the user** (as of the note above; re-check before assuming still true):
- Netlify site's environment variables are still unset (`VITE_SUPABASE_URL`/
  `VITE_SUPABASE_ANON_KEY`/`VITE_SENTRY_DSN`) — until set, the staging build falls back to the old
  GAS backend by default (safe accidental default, not real Supabase data, but also not yet a
  fully working staging site). Whether staging gets its own separate Supabase project (recommended
  — never share tables with real participant data) is still pending a cost check against the
  user's actual current Supabase plan, which Claude can't see.
- No custom subdomain (e.g. `staging.studyfeed.org`) has been set up for the Netlify site as far as
  any record here shows — it's presumably still on Netlify's own default `effervescent-trifle-
  c6afbc.netlify.app` URL. That's a manual step in Project configuration → Domain management + a
  DNS record with whoever hosts `studyfeed.org`'s DNS, not something that happens automatically
  from a push.

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

## Admin dashboard session-expiry fix + survey CSS polish (2026-08-02/03)

Two small, separate fixes bundled here since neither warranted its own long section:

- **Admin session "expiring soon" felt too short, and the warning was invisible.** Root
  cause wasn't the actual Supabase JWT lifetime — it was that `touchAdminSession()`
  (which re-syncs the dashboard's locally-tracked expiry countdown with whatever
  session supabase-js has already silently refreshed in the background) was **only
  ever called from a manual button click**, despite a code comment in
  `utils-backend-supabase.js` claiming it ran "periodically." Added a real periodic
  silent-refresh effect in `components-admin-dashboard.jsx` (every 4 minutes), so an
  actively-open admin tab should now essentially never hit the expiry flow at all.
  Separately, the warning
  banner itself (`.admin-banner`) was rendered in the dashboard's normal scrollable
  page flow — invisible once scrolled down — converted to a fixed-position top-right
  toast in all three stylesheets (also **filled in entirely missing** from
  `styles-instagram.css` — that banner and the expired-session modal were rendering
  fully unstyled under `?app=ig` before this).
- **Survey question titles now bold; post-reminder questions get a distinct tinted
  background.** Straightforward CSS change in `ui-survey.jsx`'s
  `SURVEY_REMINDER_POST_STYLE`-adjacent rules and all three stylesheets'
  `.survey-question-title`/`.survey-question-post-reminder`. One real bug found along
  the way: the Participant Information/Consent/Instructions preface
  (`SurveyPrefaceFlow`, `ui-survey.jsx`) was reusing the exact same
  `survey-question-title-content` class as real question titles, so bolding questions
  also bolded the preface prose — gave the preface its own class
  (`survey-preface-content-html`) instead.

## Interactive post-reminder questions (2026-08-03)

Per-question toggle on `post_reminder` survey questions: **Interactive** (like/comment/
share/report work exactly like the real feed, tracked into the CSV export) vs
**Static** (today's original default — fully non-interactive, no hover effects).
Full design rationale and validated architecture:
`~/.claude/plans/serene-herding-blossom.md`.

**A real, pre-existing bug found and fixed as part of this**: "static" reminders
weren't actually fully static. On Facebook, the Like button's reaction-flyout (the
emoji picker) opened on hover and its emoji buttons were clickable *regardless* of the
`disabled` prop — only the tracking call inside was gated, not the interaction itself.
Instagram's bio-hover popover had the identical gap. Fixed both
(`scheduleOpen`/flyout buttons in `ui-posts-facebook.jsx`, `showHover`/
`attachBioHover` in `ui-posts-instagram.jsx`) to check `disabled`, matching every
other actionable element in those files. This applies to *all* static reminders, not
just ones under the new toggle — this was a real gap in the "static" default itself.

**Architecture, in one sentence per piece**:
- New `reminder_interactive` boolean field on post_reminder questions, added
  everywhere its sibling `apply_feed_randomization` already lives (3 spots in
  `utils-survey.js`, ~6 spots in `components-admin-surveys-editor.jsx` — confirmed via
  grep this is *not* the page-block 4-places footgun documented elsewhere in this
  file; it's a much smaller, question-level surface).
- Extracted `buildParticipantRow`'s (`utils-core.js`) inline per-action `switch` (the
  logic that turns real-feed click events into `${post_id}_reacted` etc. CSV columns)
  into two standalone exported functions, `makeEmptyPostInteractionAggregate()` /
  `applyPostInteractionEvent(prev, event)` — a mechanical, behavior-preserving
  extraction (also happened to deduplicate two near-identical default-aggregate object
  literals that already existed side by side in that file).
- Interactive reminders reuse the **existing generic survey-answer pipeline**
  (`value`/`onChange` — the same mechanism every matrix/choice question already uses)
  rather than a parallel tracking system: every click computes the next aggregate via
  the extracted reducer and calls `onChange(question.id, next)`, landing in
  `survey_responses.responses[question.id]` exactly like any other answer.
- **A subtle but critical fix**: `PostReminderCard`'s `memo(...)` comparator
  (`ui-survey.jsx`) didn't compare `value` at all — without adding
  `(prev.value === next.value || shallowEqualObject(...))` (mirroring the pattern
  `SurveyQuestionRenderer`'s own comparator already used one level up), each click
  would've computed off a stale closured `value`, silently dropping previously
  recorded interactions on every subsequent click. Caught this by direct inspection
  before writing any of the wiring code, not after a bug report.
- CSV export (`utils-backend.js` `flattenSurveyQuestions`): turned out to need **zero
  changes** to the actual value-readout logic (`flattenSurveyResponseRecord`) — its
  existing generic `kind: "row"` column mechanism (already used by matrix/bipolar
  questions) does a plain `value[row_value]` lookup and already correctly stringifies
  booleans/joins arrays via `normalizeSurveyAnswerScalar`. Only had to declare a fixed,
  curated 7-column set (`reaction_type`, `commented`, `comment_texts`, `shared`,
  `share_target`, `reported_misinfo`, `review_helpful` — not the full ~20-field
  aggregate) for interactive post_reminder questions, reusing the exact code path
  matrix rows already exercise.

**Real gap found mid-implementation, not in the original plan**: `ui-survey.jsx`
(desktop) and `ui-survey-mobile.jsx` turned out to have their own fully independent
`PostReminderCard`/`PostReminderCardMobile` + `ReminderPostInner`/
`ReminderPostInnerMobile` implementations — near-byte-identical duplicates, not a
shared component as the "Shared survey engine" section earlier in this file implies
(that claim is about the survey engine being shared *across the three apps*, not
about desktop vs. mobile being the same code). Both needed the identical fix. One
difference worth remembering: `PostReminderCardMobile` uses **default** `memo()` (no
custom comparator), so it didn't need the `value`-comparison fix the desktop version
needed — only `ReminderPostInnerMobile` (which does have a custom comparator) did.

**Verified live** end-to-end via the by-now-established disposable-test-survey
pattern (throwaway project/feed/post/survey, local dev server, cleaned up after):
hovering Like on the interactive question showed the real emoji flyout; clicking Love
and submitting a comment both worked and landed correctly in
`survey_responses.responses` (full raw aggregate, e.g. `reaction_type: "love"`,
`comment_texts: ["Great post!"]`); the static sibling question on the same page showed
no flyout on hover and its Like button was confirmed genuinely `disabled` at the DOM
level; its stored response value was `null`. CSV column generation was verified live
too, by faking a local `hasAdminSession()` flag (not a real Supabase session — see the
"Real gap" caveat below) and calling the actual exported `loadSurveyOnlyRoster` via a
cache-busted dynamic import in the browser console: it returned exactly the 7 curated
`survey_q_interactive_*` columns for the interactive question and **zero** columns
for the static one, confirming the skip-when-static logic. Could not verify actual CSV
*row values* this way — `loadSurveyResponsesBySurveyRoster` correctly returned zero
rows, because the local `hasAdminSession()` spoof only fools this app's own
client-side check, not a real Supabase Auth session, so PostgREST's RLS correctly
denied the (actually unauthenticated) request. Not a defect — just the limit of what's
checkable without real admin credentials, which Claude should never enter. The
response-value read-out path (`flattenSurveyResponseRecord`) itself needed no code
changes and was confirmed correct by direct code reading instead.

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

**Resolved 2026-08-03** — see "Repo hygiene / GitHub security cleanup" below for the full fix
(node_modules, plus several other unnecessary tracked directories found along the way). Leaving
this note in place as a pointer rather than deleting it, since it's what originally flagged the
issue.

~~`.gitignore` does not exclude `node_modules/` — roughly 3,500 files under it are committed to
this repo. This means routine cache-clearing commands like `rm -rf node_modules/.vite` (a normal,
harmless thing to do when debugging a stuck dev server — the cache regenerates automatically)
show up as real, committable file changes instead of being invisible/ignored like in a normal
JS repo. Worth fixing (`git rm -r --cached node_modules && echo node_modules >> .gitignore`) at
some point, but that's a repo-hygiene call for the user to make, not something to do unprompted.~~

## Admin dashboard: Feed Participants + Survey Participants analysis hub (2026-08-03)

Complete rework of the old single "Participants" nav item/page (`ParticipantsPanel` in
`components-admin-parts.jsx`, ~950 lines), split into two dedicated pages per direct user request
("I want two separate participant pages... especially for the survey participant page, I want it
to be like an analysis hub"). Session ran mostly in auto mode overnight — see
`~/.claude/plans/steady-continuing-harbor.md` for what's verified vs not.

**Root cause found and fixed, not just a redesign**: for an ordinary single-feed-then-survey study
(the most common delivery mode), survey response data was **never shown anywhere in the admin
UI** — `loadSurveyOnlyRoster` (`utils-backend.js`) filtered `surveyResponses` down to only rows
with `feed_id === "SURVEY_ONLY"` unless the survey's own `delivery_mode` was literally
`"survey_only"`, silently dropping every real feed-then-survey response. This also broke the
existing "Download survey CSV" button in the Surveys admin page (same function, same bug) for any
non-survey-only study. Fixed by removing the filter entirely — `loadSurveyResponsesBySurveyRoster`
already scopes strictly by `survey_id`, so no extra feed_id filtering was ever a valid idea for
"give me this survey's responses."

**New files**:
- `src/admin/components-admin-participants-feed.jsx` (renamed from `components-admin-parts.jsx`,
  `git mv`'d to preserve history) — `FeedParticipantsPage`. Same well-tested simulate/CSV engine as
  before, but trimmed of all survey-merge branches (`hasMultiFeedSequence`, survey-only-panel path)
  since it's feed-only now; gained its own `PageHeader` (was previously assembled inline in
  `components-admin-dashboard.jsx`'s route element) plus two new charts using data that was already
  being computed but never visualized: **submissions-over-time** and **engagement-by-post**
  (reacted/commented/shared % per post), both plain-div bar charts, no new dependency.
- `src/admin/components-admin-participants-survey.jsx` — `SurveyParticipantsPage`, the new
  analysis hub. Survey picker (remembers last pick per project in localStorage) drives everything
  purely off `survey_id` via `loadSurveyFromBackend` + `loadSurveyResponsesBySurveyRoster` — no
  delivery-mode branching needed, which is *why* it doesn't have the bug above. Renders:
  - **Demographics** — auto-detected via keyword match on question id/text (age, gender, income,
    education, ethnicity, employment, marital, nationality...); numeric → mean/SD/median/histogram,
    categorical → counts/% bar list.
  - **Measures** — auto-detects composite (multi-item) scales two ways: matrix questions (a matrix
    question with id "BL" and rows BL_1/BL_2/BL_3 becomes one composite) and standalone
    same-prefix questions (three separate slider/single-choice questions literally named BL_1,
    BL_2, BL_3). Each composite gets mean/SD/median/range/**Cronbach's alpha**/histogram plus a
    collapsible item-level breakdown. Standalone (non-composite) numeric and categorical questions
    get their own cards; free-text questions get a collapsible response list (first 100).
  - **Group comparison** — when `survey.experiment_groups.length >= 2`: every measure/composite
    gets per-group mean±SD±N with a **Welch's t-test** (2 groups) or **one-way ANOVA** (3+);
    categorical variables get a **chi-square test**. All computed from scratch in
    `src/utils/utils-survey-analysis.js` (log-gamma / regularized incomplete beta / regularized
    incomplete gamma — standard Numerical-Recipes-style approximations, no new dependency). This is
    the single biggest new file, ~550 lines, fully exported via `src/utils/index.js`.
  - Raw response list + "Download Survey CSV" (reuses the now-fixed `loadSurveyOnlyRoster`).
- `src/utils/utils-survey-analysis.js` — the stats/classification engine backing all of the above;
  pure functions, no React/backend knowledge, operates on a normalized survey definition + raw
  `survey_responses` rows.

**Modified**: `utils-backend.js` (the `loadSurveyOnlyRoster` fix above, plus `flattenSurveyQuestions`/
`flattenSurveyResponseRecord` changed from module-private to `export`ed so the analysis engine could
reuse them instead of reimplementing column-key logic — this is *not* the page-block/experiment-group
4-places footgun documented elsewhere in this file, just two small pure helpers). `AdminShell.jsx`
nav: one "Participants" item → "Feed Participants" (👥) + "Survey Participants" (📊), routed at
`/admin/dashboard/participants/{feed,survey}` (old `/participants` path redirects to `/feed`).
`components-admin-dashboard.jsx`: removed the now-dead `participantsCount`/`showAllParticipants`/
`participantsRefreshKey` state and the old inline `ParticipantsPanel` route block (~90 lines →
~30), since both new pages are fully self-contained (own `PageHeader`, own data fetching, own
owner-gated "Wipe" button on the feed page).

**Verified**: all changed/new files parse clean (`@babel/parser`). The sandbox's `npm run dev` (see
"Build/dev notes") turned out to already be running from an earlier point in the session — used it
for real verification this time, not just syntax-checking: fresh browser tab, zero console errors,
every changed/new module (including both new participant page files and the analysis engine) loaded
with a real `200`, confirming the whole module graph resolves and evaluates correctly. **Did not log
in** — the admin login form had credentials already populated (browser autofill, not typed by
Claude) and submitting them was refused on principle (never enter/submit credentials, even
pre-filled ones not typed by Claude). So the actual rendered content of both new pages, and a real
click-through, is unverified — see the plan file's "What's NOT verified yet" section.

## Post rendering fixes: static-reminder hover, reminder width, "See more"/"See less" (2026-08-03)

Three bugs reported directly by the user after using the interactive-post-reminder feature (see
"Interactive post-reminder questions" above) for real. All three turned out to affect posts in
general, not just reminders — fixed at the shared source, not patched per-call-site.

1. **Static reminder Like/Comment/Share/"..." still greyed on hover.** `.action:hover` and
   `.dots:hover` in all three stylesheets (`styles-facebook.css`, `styles-instagram.css`,
   `styles-amazon.css`) had no `:not(:disabled)` guard, so the hover background applied regardless
   of the real `disabled` attribute on those `<button>`s — other buttons in the same codebase
   (`.amz-helpful-btn`, `.survey-nav-btn`, etc.) already used the correct `:hover:not(:disabled)`
   pattern; `.action`/`.dots` were just missed. Fixed in all three stylesheets, plus added an
   explicit `:disabled{cursor:default}` override. Verified by injecting the real markup/CSS into
   the live running page and checking `document.styleSheets` directly for the parsed rule text
   (browser-automation synthetic `hover` events don't reliably trigger real CSS `:hover` matching
   in this environment — same caveat as the click-simulation gotcha already documented under
   "Admin user management ported" above — so this file-content check was the reliable verification
   path, not a screenshot).
2. **Reminder post wider than the real feed post.** Found in *four* separate hardcoded spots (a
   footgun on its own): `ui-survey.jsx`, `ui-survey-mobile.jsx` (desktop/mobile reminder each have
   their own independent implementation, see "Interactive post-reminder questions" above),
   `styles-facebook.css`, and `styles-amazon.css` all independently hardcoded
   `max-width: min(760px, 100%)` for `.fb-reminder-post .survey-post-reminder-frame`, while the
   real feed is capped at `--feed-max: 700px`. Fixed all four to reference
   `var(--feed-max, 700px)` instead of a hardcoded literal, so they can't drift out of sync again.
   (Instagram's reminder width was already correct — `.ig-reminder-post` hardcodes 470px matching
   its own real feed card width, confirmed via its own comment "matches feed card width".)
3. **Double ellipsis before "See more"** (e.g. "...  ... See more"), and no way to collapse back
   once expanded. Root cause diagnosed here as `-webkit-line-clamp`'s native ellipsis not being
   fully covered by the custom `.fade-more` overlay; **fix attempted here (`text-overflow: clip`)
   turned out not to actually work** — see "Post text truncation: the double-ellipsis fix above
   didn't work, real fix" (2026-08-03, later same day) for the real root cause (the browser still
   renders the native ellipsis regardless of `text-overflow`; it was only ever *visually* masked by
   the overlay sitting in the same bottom-right spot, which breaks whenever the clamp boundary
   lands somewhere else, e.g. a blank line between paragraphs) and the actual fix (drop
   `-webkit-line-clamp` entirely in favor of a plain `max-height` cap, which can't produce a native
   ellipsis at all). The verification claim below ("confirming a single '…' renders") was real but
   incomplete — it confirmed the fix for the specific text tested, not the underlying mechanism.
   Also added the missing **"See less"** (Facebook) / **"less"** (Instagram, matching real
   Instagram's lowercase "more"/"less") / **"Read less"** (Amazon) collapse links — none of the
   three apps had a way to re-collapse expanded text before this. New `wasClamped` state (distinct
   from `needsClamp`, which flips back to `false` once expanded since the box is no longer visually
   clamped) tracks "this text was truncated at least once" so the collapse link knows when to show.
   `onCollapse` wired through `PostText` (`ui-core-facebook.jsx`, `ui-core-instagram.jsx`) and
   Amazon's separately-implemented `ReadMoreText` (`ui-posts-amazon.jsx` — character-count based,
   not line-clamp based, so it never had the double-ellipsis bug, but still lacked "Read less").
   `onCollapse` fires a `collapse_text`/`review_read_more{expanded:false}` tracking action
   symmetric with the existing `expand_text`/`review_read_more{expanded:true}`.

Since `PostReminderCard`/`ReminderPostInner` render the real `PostCard` component internally, the
"See more"/"See less" fix applies to reminder posts automatically — no reminder-specific change
needed for that part, only for the width/hover bugs which live in reminder-specific CSS.

**Verified**: all changed files parse clean. Live-verified via the running dev server as described
above (synthetic DOM injection + direct stylesheet inspection) — not verified via an actual click
on a real rendered post's "See more" button (see plan file).

## Feed linked to a `survey_only` survey: feed URL was redirecting to the survey (2026-08-03)

User-reported: "if a feed is linked to a survey-only survey, accessing the feed through the feed
URL should lead me to the feed, not the survey." Root cause: `isSurveyOnlyMode` (the single flag
`requiresFeedStage` and therefore the entire routing tree in each `App-*.jsx` keys off — confirmed
by grep, used in ~15 places per file) was derived purely from the *linked survey's own*
`delivery_mode`, with no regard for how the participant actually arrived. So a feed accidentally
linked to a survey whose `delivery_mode` is `"survey_only"` would skip straight to the survey even
when opened via the feed's own `?feed_id=` URL — "survey_only" is meant to describe the survey's
own direct launch link (`?survey_id=`) behavior, not to hijack every feed linked to it.

**Fix**: `isSurveyOnlyMode` now also requires `isDirectSurveyLaunch` (arrived via `?survey_id=`,
not `?feed_id=`) — reordered `isDirectSurveyLaunch`'s declaration earlier in each file so it could
be referenced. Applied identically to all three `App-*.jsx` files (this is the near-duplicate-
`App-*.jsx` footgun documented at the top of this file — checked all three from the start rather
than fixing Facebook and finding the same bug reported again later for IG/Amazon). Feed URLs now
always show the feed and follow normal `feed_then_survey` routing regardless of what the linked
survey's `delivery_mode` claims; only a survey's own direct link can trigger survey-only behavior.

**Verified**: all three files parse clean, live dev server picked up the change with zero console
errors. **Not verified against a real feed+survey_only-survey combination** — would need either a
real project with that specific (mis)configuration or one deliberately created via admin, plus
login. See plan file.

## Repo hygiene / GitHub security cleanup (2026-08-03)

Prompted by the user asking two things directly: "how do we remove unnecessary files... from my
GitHub" and "does my GitHub really need to be public? I'm concerned about security." Investigated
rather than guessed — checked actual repo visibility via the public GitHub API (`curl
api.github.com/repos/...` — no auth needed since the repo was public, which itself is a valid way
to confirm visibility without `gh` being authenticated), and scanned every tracked file *and full
git history* (`git log --all -p` piped through pattern grep) for leaked AWS keys, Supabase
`service_role` keys, etc. **No real secrets found leaked anywhere, past or present** — the only
hits were the AWS SDK's own library code (committed as part of `backend/node_modules`, see below)
matching field names like `aws_secret_access_key`, and CLAUDE.md's own prose *about* `service_role`
never being exposed. One real (but low-stakes, and *not* fixed by repo privacy) finding: `GS_TOKEN`
is hardcoded in `utils-backend.js` — it's a real shared secret for the GAS backend, but it's
already shipped in cleartext in the built JS bundle to every site visitor regardless of whether the
GitHub repo is public, so making the repo private wouldn't actually hide it. Noted, not changed.

**Repo visibility decision (made with the user, not unilaterally)**: stays **public**. The real
constraint driving this: the deploy workflow (`.github/workflows/deploy.yml`, `actions/deploy-
pages@v4`) publishes to `studyfeed.org` via GitHub Pages, and GitHub Pages only works on **private**
repos with GitHub Pro/Team/Enterprise — the Free plan requires the repo to be public for Pages to
work at all, independent of which deploy mechanism (branch- or Action-based) is used. Presented
three options (stay public + clean up / go private + Pro ~$4/mo / go private + move hosting to
somewhere that supports private-repo static deploys for free, e.g. Cloudflare Pages) and the user
chose to stay public.

**Unnecessary tracked files found and untracked** (`git rm --cached`, not deleted from disk, not a
history rewrite — offered a full `git filter-repo` history purge too, declined since no real secret
was found and repo *size* wasn't the concern):
- **`backend/`** (132MB!) — a local-only Express + AWS-SDK S3-upload signer
  (`backend/server.js`), confirmed **zero references anywhere in the actual app** (grepped for
  `localhost:4000`/`backend/server`/`uploadVideoToBackend` — the last of these was already flagged
  as dead/unused in the "Backend migration" section above; this is that same dead function's local
  dev counterpart). Included its own fully-committed `node_modules/` (AWS SDK + deps). Root
  `package.json` has no workspace reference to it — fully orphaned. Left on disk, gitignored going
  forward.
- **`node_modules/`** (root, 83MB, 4,135 files) — the issue already flagged in the now-resolved
  "node_modules is tracked" note above.
- **`docs/`** — a *stale* build output (older file hashes than `dist/`), almost certainly a
  leftover from before the GitHub Actions workflow existed (an earlier "serve Pages from /docs"
  deploy method). Not what's actually being served now.
- **`dist/`** — current build output; also shouldn't be committed, the CI workflow rebuilds it
  fresh from source on every deploy.
- **`supabase/.temp/`** — the Supabase CLI's own local session cache (project ref, postgres
  version, pooler URL, etc.), auto-regenerated by `supabase` CLI commands, genuinely introduced as
  a side effect of the Supabase migration work.
- **8 `.DS_Store` files** scattered through the repo.

`.gitignore` updated accordingly (also de-duplicated pre-existing duplicate `.env`/`CLAUDE.md`
lines while in the file, no behavior change). Committed as `9778139 clean up github repo`
(11,799 files changed) and confirmed pushed to `origin/main`. **The user separately deleted
`.claude/launch.json` from the repo right after** (`2f545db Delete .claude directory`, done outside
this session, not part of the cleanup work above) — it's genuinely gone from disk now, not just
gitignored. See `~/.claude/plans/steady-continuing-harbor.md` for what a future session should do
if it needs that file back (recreate locally, don't recommit without asking).

## Public-site access gate: bare `studyfeed.org` no longer falls through to a feed (2026-08-03)

User request: visiting the bare domain with no launch params was landing on whatever feed happens
to be the project default — not desired, since the site is meant to be reached only via real
participant launch links or the admin route, not stumbled onto. First pass made the bare domain
render blank; per direct follow-up feedback ("is a 404 style page better?" → yes), upgraded to a
plain, generic 404 page instead, since blank is indistinguishable from "broken" and a 404 confirms
the server responded correctly while revealing nothing about what the site actually is.

**Fix is entirely in `index.html`'s inline bootstrap script — no app code touched.** Before
importing any app bundle, checks whether the URL is a recognized entry: `#/admin...` (admin route)
or has `feed`/`feed_id`/`survey`/`survey_id` in the query string *or* the hash query (mirrors
`getCombinedSearchParams()` in `utils-core.js`, which real launch links can theoretically use
either form of). If neither, no `import()` ever runs — no JS bundle loads, no backend call is
ever made — and `#root`'s innerHTML is replaced with a static "404 / This page could not be
found." block, styled generically (no branding, no mention of surveys/feeds/research).

This is a client-side-only gate, not a real access-control boundary — anyone with a real or
guessed launch link still reaches content exactly as before. It only stops the "wandered onto the
bare domain" case CLAUDE.md's own screenshot-sharing risk doesn't otherwise cover.

**Verified**: confirmed live in the running dev server — bare `localhost:5173` renders the 404
block with the correct page `<title>`; a URL with `?feed=...`/`?survey=...` still loads the normal
app. Not verified against the deployed production domain directly (this repo has no staging
buffer — see "Deployment" section up top) — worth a quick check of `studyfeed.org/` bare vs. a
real feed link once this ships.

## Survey Participants analysis hub: correctness fixes + custom tag-based measure groups (2026-08-03)

Follow-up work on the analysis hub built earlier the same day (see "Admin dashboard: Feed
Participants + Survey Participants analysis hub" above) — this section is an *extension* of that
page, not a rebuild. Prompted by direct user feedback after describing how they'd actually
analyzed a real study in R.

**Two correctness bugs fixed, both in `src/utils/utils-survey-analysis.js`:**
1. **Question text showed raw HTML** (e.g. `<p><b>What is your age?</b></p>` literally on
   screen). Question text comes straight out of the survey editor's rich-text field
   (`normalizeRichTextHtml`), which is fine for rendering the real question but was never meant to
   be shown as a plain compact label/chart title. New `stripHtmlToText()` helper (DOM-based
   `textContent` extraction when `document` exists, falls back to a regex strip otherwise, since
   this file deliberately has no React/DOM dependency per its own header comment) applied at the
   source in `classifySurveyQuestions()` — every downstream consumer (chart titles, composite
   labels, CSV-adjacent breakdown tables) gets clean text automatically.
2. **Demographics with numeric-coded choices (e.g. gender 1/2/3, education level 1–5) were
   averaged as if continuous** — showing "Mean 1.7, SD 0.6" and a histogram from 1.0–3.0 for
   `gender` instead of a category bar chart. Root cause: `choicesAreNumeric()` (checks whether
   every choice's stored `value` parses as a number) is the right heuristic for genuine Likert
   *measure* items (BL/PK-style matrix rows, where averaging numeric-coded agreement scales is
   standard practice) but wrong for demographic *category* codes, which just happen to also be
   sequential integers. Fixed by gating `numeric` classification on `!isDemographic` for every
   choice-based question type (`SINGLE`, `DROPDOWN`, `MATRIX_SINGLE`, `BIPOLAR`) — demographics are
   now always `categorical` regardless of what the underlying codes look like. Only demographics
   answered via a genuine numeric input (`SLIDER`) stay numeric — free-text (`TEXT`/`TEXTAREA`)
   demographics were already bucketed as free-text responses, unaffected. No UI changes were
   needed for this fix — `CategoryBarList` already existed and was already correct, it was just
   being fed the wrong `kind`.

**Demographics UI**: `DemographicsSection` changed from "render every detected demographic in a
grid" to a single dropdown (labelled by `DEMOGRAPHIC_KIND_LABELS`) driving one chart below it, per
direct request ("fewer visualisations, and instead have the visualisations be adaptable").

**New feature: custom tag-based measure groups.** The real gap the user described: auto-detected
composites only group items sharing one literal question-id prefix (`BL_1`/`BL_2`/`BL_3` →
composite "BL"), but a study repeating measures across many stimuli in a 2×2-ish design (their
real example: `MI{1..10}_EMO_BL_{1..3}`, `AI{1..10}_NOEMO_ENG_{1..3}`, etc. — misinformation vs.
accurate info × emotional vs. not × believability vs. engagement, across 10 posts each) needs
*cross-cutting* groups ("every BL item," "every MI+EMO+BL item") that no naming-prefix heuristic
can discover on its own, plus occasional hand-picked exclusions (their real `PK` mediator measure
is `mean(PK_1, PK_2, PK_4)` — deliberately skipping `PK_3`).

- **Engine** (`utils-survey-analysis.js`): `tokenizeItemId(it)` splits an item's id (questionId +
  compositeQuestionId + itemKey, deduped) on any non-alphanumeric boundary into uppercase tokens —
  `"MI3_EMO_BL_1"` → `["MI3","EMO","BL","1"]`. `matchesTagPattern(tokens, pattern)` is a small
  query language over those tokens: space-separated = AND, comma-separated = OR, `*` = wildcard,
  and a bare token (no `*`) **prefix-matches** rather than requiring exact equality — necessary
  because this naming convention fuses the post index onto the tag with no delimiter (`MI3`, not
  `MI` + `3`), so a bare token can never literally equal `"MI"`; prefix-matching still stays
  token-boundary-safe (matching happens per split token, not as a substring of the whole id), so
  `"EMO"` never accidentally matches `"NOEMO"` — confirmed this distinction live against fabricated
  data shaped exactly like the real naming scheme before writing any UI (`MI EMO BL` → 9 items,
  `AI NOEMO ENG` → 9, `EMO`/`NOEMO` → 36 each, correctly non-overlapping). `findItemsMatchingTagPattern`/
  `getGroupableItems` (numeric, non-demographic items only) and `buildCustomGroupComposite(groupDef,
  dataset)` build a composite-shaped object from an explicit item-ref list, so the *existing*
  `summarizeComposite`/`computeCompositeScores` (mean/SD/median/Cronbach's α) work on custom groups
  completely unchanged — no new stats code needed. `computeGroupComparison` gained an optional
  third argument (`customGroupComposites`) so between-experiment-group ANOVA/t-tests run against
  custom groups too, not just auto-detected ones.
- **UI** (`components-admin-participants-survey.jsx`): new "Custom measure groups" panel above
  Measures. `GroupEditor` — name + pattern fields, live match preview as a checkbox list (so a
  bulk pattern match like `PK` can then have `PK_3` individually unchecked before saving). Editing
  an existing group reconstructs which items were manually included/excluded relative to what its
  saved `pattern` alone would currently match (`overrides` Map, seeded once on open from the diff
  between the saved `itemKeys` and a fresh pattern-match) — so re-opening a group to tweak its
  pattern doesn't silently un-exclude something like `PK_3` that was deliberately dropped earlier.
  Saved groups render through the same `CompositeMeasureBlock` auto-detected composites already
  use (now accepts an optional `actions` slot for Edit/Delete). **Persisted in this browser's
  `localStorage` only**, keyed per survey id (`admin_custom_measure_groups::{app}::{project}::{survey}`)
  — reappears every time this survey's analysis is reopened on this machine, but does not sync to
  other admins/browsers; flagged as a real tradeoff, not silently chosen, since a backend-synced
  version would need new Code.gs/Supabase work this session didn't do.
- Auto-detected composites are unchanged and still the default for simple surveys — the
  "Auto-detected measures" card just collapses by default once custom groups exist (seeded once
  from `customGroups.length === 0` via `useState`, not a controlled `open` prop, specifically so a
  manual toggle survives later re-renders instead of snapping back — caught this exact bug by
  reasoning through it before verifying, not from a bug report).

**Verified**: engine functions (`tokenizeItemId`, `matchesTagPattern`, `findItemsMatchingTagPattern`,
`buildCustomGroupComposite`, `summarizeComposite`) tested live against the running dev server with
fabricated data shaped exactly like the real MI/AI×EMO/NOEMO×BL/ENG naming scheme, including the
exact `PK_1,PK_2,PK_4`-excluding-`PK_3` exclusion workflow end to end — all matched expected counts
and computed means correctly. Component files parse clean and load through Vite's real module
graph with no errors. **Not click-tested** — same admin-login limitation noted throughout this
file (credentials off-limits); the actual pattern-input → checkbox-refine → save interaction has
not been exercised by a real click. Given real analysis will be run against this, worth trying on
one real survey (ideally this exact one, since the user has the R script's output to sanity-check
against) before trusting it for a real writeup.

## Post text truncation: the double-ellipsis fix above didn't work, real fix (2026-08-03)

Reported again by the user with a real post: a two-paragraph post (blank line between sentences)
showed a lone "…" alone on the second line, disconnected from the "… See more" indicator at the
bottom-right. This is the exact bug "Post rendering fixes" (above, earlier the same day) claimed
to have fixed via `text-overflow: clip` on `.text.clamp`. It hadn't been.

**Root cause, actually confirmed this time by reproducing it in an isolated sandboxed page (not
just reasoning about CSS)**: `text-overflow: clip` does not suppress `-webkit-line-clamp`'s
built-in multi-line ellipsis in the current browser engine — it never did. The earlier fix
*looked* like it worked because the native ellipsis and the custom `.fade-more` overlay both
normally land in the same bottom-right spot, visually merging into what reads as one indicator.
Blank lines between paragraphs break that coincidence: the blank line becomes the visually-clamped
last line, and the native ellipsis renders alone at the *start* of that empty line — nowhere near
the overlay, so both become visible. **This means every clamped post likely still had two ellipses
rendering all along, just invisibly overlapping in the common case** — not a regression, a latent
bug the earlier fix never actually closed. Instagram's caption-row CSS
(`.ig-caption-row .text.clamp`) had its own, different workaround for the same underlying problem
— it hid the *custom* dots (`display:none!important`) and relied on the native ellipsis alone —
which has the identical failure mode in the same blank-line case, confirmed by reproducing it too
before touching any code.

**Fix**: replaced `display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
overflow:hidden; text-overflow:clip` with a plain `overflow:hidden; max-height:3em` cap (`3em` =
2 lines at this codebase's consistent `line-height:1.5`) in `styles-facebook.css` and
`styles-instagram.css` (both the base `.text.clamp` rule and the two `.ig-caption-row`-scoped
variants, including the `max-width:700px` media-query copy). No `-webkit-line-clamp` at all means
no mechanism exists to generate a native ellipsis in the first place — nothing to suppress or
mask. Added `display:block` to Instagram's rules specifically, since `PostText` there renders as
inline `<span>`s (Facebook's is a real `<p>`, block by default already) and `max-height` has no
effect on non-replaced inline elements. Also removed Instagram's now-unnecessary
`.ig-caption-row .fade-more .dots{display:none!important}` — its own "…" now renders again,
matching Facebook's `… See more` instead of the previous `… more` (no dots).
**`styles-amazon.css` still has the old `.text.clamp` rule** but it's genuinely dead — Amazon's
`ReadMoreText` (`ui-posts-amazon.jsx`) is character-count-based, never uses the `.text`/`.clamp`
classes at all, confirmed via grep — left untouched, not a live bug.

**Verified far more rigorously than the earlier attempt**: built an isolated `<iframe>` sandbox
(to rule out any cross-contamination from the app's own global stylesheet or leftover state from
earlier test iterations — caught and cleaned up exactly that contamination once mid-session),
injected the *real* CSS fetched live from the running dev server (not a hand-typed copy) for both
`styles-facebook.css` and `styles-instagram.css`, at large font size for pixel-level clarity, and
confirmed visually: **before** the fix, the exact reported case renders `tomorrow."…` with a native
ellipsis mid-line and a second `… See more` at the end; **after**, exactly one `… See more` and
nothing else, for both the two-sentence-wraps-naturally case and the exact blank-line case from
the report. Not verified inside the actual running participant feed UI with a real post (would
need a live post with this exact paragraph-break shape) — worth a quick look on the real site once
this deploys.

## Experiment groups can now route feed(s) sequences, not just survey content (2026-08-03)

User request: for `feed_then_survey`/`multi_feed_then_survey` studies, let different experiment
groups see different feed sequences — e.g. Group A gets Feed 1 → Feed 3, Group B gets Feed 2 →
Feed 4 — while participants still use one plain survey link (not a specific feed's link), group
assignment stays round-robin exactly as before, and the CSV should reflect whichever sequence each
participant actually went through. Previously, `experiment_groups` only ever gated survey
*content* (`visible_to_group_ids`) — completely independent of which feed(s) a participant saw.

**Investigated before writing any code** (a research agent mapped the existing experiment-group
and feed-sequence architecture end to end before any design decisions were made — findings folded
directly into this section rather than a separate plan file) and found the hard part was already
solved: `assignExperimentGroup`
(frontend `utils-backend.js`, Supabase RPC `assign_experiment_group` in
`20260801000008_experiment_assignments.sql`) is keyed *only* on `survey_id` + `session_id` — no
`feed_id` involved anywhere in that call chain, and it already fires from `ensureSurveyLoaded`
*before* the feed sequence is ever shown to the participant (well before the
participant-information/consent screens even render). So "assign group first, route to that
group's feed sequence, keep it round-robin" fit the existing architecture with zero changes needed
to the assignment mechanism itself.

**Real scope-limiting discovery**: `App-instagram.jsx` has **no multi-feed-sequence support of any
kind** today — no `feedSequenceIds` state beyond a single feed, no `effectiveFeedSequenceIds`, no
"Submit Feed N & Continue to Feed N+1" UI, nothing — confirmed via exhaustive grep, zero matches.
`App-facebook.jsx` and `App-amazon.jsx` are identical for this entire feature (verified via diff).
Presented this to the user directly before building anything; **decision: Facebook + Amazon only**
for this feature. Instagram is unaffected either way — single-feed-then-survey still works there
exactly as before, it just can't do group-varied multi-feed sequences (a pre-existing gap, not
something this work introduced or was asked to fix).

**Data model — `experiment_groups[i].feed_sequence_ids: string[]`, empty = unchanged behavior.**
Added to the group object shape in **five separate places** (this is the same "known duplicated
logic" footgun CLAUDE.md's own "Known duplicated logic" section warns about, now confirmed to
apply to `experiment_groups` too, not just page-blocks) — missing any one would have silently
stripped the field on some save/load path:
1. `src/utils/utils-survey.js` — `makeExperimentGroup`, `normalizeExperimentGroups`,
   `frontendExperimentGroupsToBackend` (the shared, canonical implementation).
2. `src/admin/components-admin-surveys-editor.jsx` — its own **separately-implemented**
   `makeExperimentGroup(index)` (different signature — takes a bare index, not an overrides
   object; same "same name, different function" trap as `normalizeSurveyPageBlocks` elsewhere in
   this file) and `normalizeSurveyExperimentGroups(survey)`.
3. `supabase/functions/_shared/survey-sanitize.ts` — its own independent re-implementation of
   `normalizeExperimentGroups`/`frontendExperimentGroupsToBackend` (TypeScript, used by the
   `save-survey` Edge Function). **Deployed** (`supabase functions deploy save-survey`) — without
   this, every survey save through the admin editor would have silently dropped the new field.
4. No Code.gs change made or handed off — GAS isn't live in production (see "Backend migration"
   section), so this feature is Supabase-only for now. Say so explicitly if GAS rollback parity
   ever matters; not done here.
5. No Postgres migration needed — `experiment_groups` lives inside `surveys.definition` JSONB, and
   `assign_experiment_group` only ever reads/returns a bare `group_id` string, never inspects a
   group's other fields — so it needed zero changes despite being central to this feature.

**Admin UI** (`components-admin-surveys-editor.jsx`, `ExperimentGroupsEditor`): each group now has
an expandable "Feed sequence" row (only shown when the survey has linked feeds at all) —
checkbox-per-feed + ↑/↓ reorder, deliberately mirroring the *existing* survey-level feed picker's
interaction pattern (`components-admin-surveys.jsx`'s "Feed Setup" tab) rather than inventing a
new one. Picks from the survey's own already-linked feeds (`linkedFeeds` prop, threaded down from
`SurveyEditor`), not the full project feed list — keeps the invariant that every feed any group
might route to is still part of the survey's own `linked_feed_ids`, so existing feed-scoped
machinery (post-reminder-question available-posts filtering, the "Feed Setup" summary banner)
keeps working unchanged. Leaving a group's sequence empty falls back to the survey's own default
sequence — fully backward-compatible with every existing survey using groups today.

**Frontend routing** (`App-facebook.jsx`, `App-amazon.jsx`, `ensureSurveyLoaded` — identical logic
in both, Amazon's group-assignment block had to be *reordered* first since it originally ran
*after* the feed-sequence computation instead of before, unlike Facebook's existing order): once
`assignedGroupId` is known, looks up that group's `feed_sequence_ids`; if non-empty **and** the
participant arrived via a plain survey link (`isDirectSurveyLaunch`, not an explicit `?feed_id=`
URL — an explicit feed link always wins, same precedent as the existing survey_only-linked-feed
fix), bakes it into `normalizedSurveyBase.linked_feed_ids`/`feed_sequence_ids` *before*
`normalizedSurvey` is built — not just into local React state. **This distinction mattered and was
caught before shipping**: `effectiveFeedSequenceIds` (the memo everything downstream reads — "next
feed" UI, the sequence recorded on submission) prioritizes `linkedSurvey.feed_sequence_ids` ahead
of any local state, so an earlier version of this fix that only called `setFeedSequenceIds(...)`
would have computed the right value and then had it silently ignored by every consumer. `startBoot`
still makes an initial guess from the survey's default sequence before the group is known
(unavoidable — group assignment is async) and rewrites the URL to match; `ensureSurveyLoaded` corrects
both `activeFeedId` and the URL (`setFeedIdInUrl(..., {replace:true})`) once the group-specific
sequence is known, before the participant ever sees a feed (this correction races the
participant-information/consent screens, not the feed render itself, so there's no visible flash).

**CSV**: no changes needed anywhere. `loadMultiFeedParticipantSurveyRoster` already builds its
per-feed columns (`feed1_feed_id`, `feed2_feed_id`, ...) and `feed_sequence_ids` summary column
from each participant's *actual* logged feed visits, not from static survey config — so once
routing genuinely varies by group, the export reflects it with zero export-side changes.

**Verified live against the real production Supabase project** (not guessed): created a disposable
survey with Group A → feed B and Group B → feed A — deliberately *inverted* relative to the
survey's own default sequence order, so a false pass via coincidental overlap was impossible.
Loaded the plain survey link twice with fresh sessions (no cache-clearing needed —
`sessionIdRef` is a fresh in-memory `uid()` per mount, not persisted) and confirmed the URL
corrected to `feed=zzt_feedB` then `feed=zzt_feedA`, alternating exactly with the round-robin
assignments recorded in `experiment_assignments` (`gA` then `gB`). Cleaned up with zero rows left
behind (`projects`/`feeds`/`surveys`/`experiment_assignments`/`experiment_group_counters`, all
scoped to a `zzclaudetest_` prefix). All touched files parse clean and the admin editor loads
through Vite's real module graph with no errors. **Not verified**: the "no group override
configured" fallback path wasn't independently re-tested live this session (only verified by code
reading — the `nextFirstFeedId !== activeFeedId` no-op check means it should be a byte-for-byte
no-op versus the pre-existing, already-exercised code path), and no full visual click-through with
real posts/content was done (same admin-login limitation as elsewhere in this file) — only the
routing decision itself (which feed gets chosen) was verified, not a full participant walkthrough.

## Supabase restructuring: experiment_groups + custom_measure_groups pulled out of jsonb (2026-08-03)

Prompted by a direct question ("does it make sense to disentangle survey def from the database
into real tables?"). Recommendation given and followed: don't normalize the survey definition
tree itself (pages/page_blocks/questions — a fundamentally document-shaped, frequently-reshaped
editable tree; splitting it into tables would trade "add a jsonb key" for schema migrations, and
wouldn't fix the "N places to update" duplicated-reconciliation-logic footgun documented
elsewhere in this file, just move it into SQL joins). Two things *were* genuinely relational
already and got pulled out: **experiment group definitions** (already had a real neighbor table,
`experiment_assignments`) and **custom measure groups** (a real gap — localStorage-only,
never synced across browsers/admins, per the "Survey Participants analysis hub" entry above).

**Before touching anything**: confirmed two real, currently-live surveys already have
experiment_groups with real participant assignments — "Prebunk Paper Study 1 - Main" (32
assignments) and "Prebunk Paper Study 2" (2 assignments) — and confirmed with the user that
neither was actively collecting at the time, same "ask before touching live-assignment data"
precedent as the posts.id incident above.

**New migration `20260801000015_experiment_groups_and_custom_measure_groups_tables.sql`**:
- `experiment_groups` table (`survey_id` FK, `id`, `name`, `feed_sequence_ids text[]`,
  `sort_order`) — backfilled from every existing survey's
  `definition->'experiment_groups'` in the same migration, immediately before
  `assign_experiment_group` is switched over to read from the new table (no window where a
  live survey's groups exist in one place but not the other). RLS mirrors `feed_surveys`
  exactly: public select (participants read it indirectly via `supabaseLoadSurveyDefinition`,
  the same anon-key client that already reads `surveys.definition`), editor/owner write.
- `custom_measure_groups` table (`id` PK, `survey_id` FK, `name`, `pattern`, `item_keys text[]`,
  `sort_order`) — greenfield, no backfill possible (the data only ever existed in individual
  admins' browser localStorage). Admin-only RLS (no public select — nothing participant-facing
  reads it).
- `assign_experiment_group` RPC: same round-robin/locking logic as
  `20260801000008_experiment_assignments.sql`, just reads `array_agg(id order by sort_order,
  id) from experiment_groups` instead of indexing into a jsonb array. `reset_experiment_group_
  assignments` untouched (only ever touched assignment/counter rows, never group definitions).

**Deliberate design choice — the in-memory JS/TS object shape is unchanged everywhere**:
`survey.experiment_groups` is still a plain array on the survey object in the admin editor,
`App-facebook.jsx`/`App-amazon.jsx` routing, and `utils-survey.js`/`survey-sanitize.ts`
validation — none of those files were touched. Only the persistence-layer adapter changed:
`supabaseLoadSurveyDefinition` (`utils-backend-supabase.js`) now fetches `experiment_groups`
rows alongside the `surveys` row and merges them onto the returned object (ordered by
`sort_order`), and `save-survey/index.ts` now deletes+reinserts `experiment_groups` rows
(same delete+reinsert idiom `feed_surveys` sync already uses just below it in the same
function) and strips the key from the stored `definition` jsonb — the table is the sole
source of truth now, no second driftable copy. This kept the blast radius to exactly two
files plus the migration, instead of touching the editor UI or routing logic at all.

**Custom measure groups wired in**: `utils-backend-supabase.js` gained
`supabaseListCustomMeasureGroups`/`supabaseSaveCustomMeasureGroups` (same whole-array
delete+reinsert idiom), `utils-backend.js` gained `loadCustomMeasureGroups`/
`saveCustomMeasureGroups` wrappers (Supabase-only — this feature postdates the GAS cutover
and has no GAS counterpart, so the non-Supabase branch is a plain no-op, not a dead
`admin_token` call). `components-admin-participants-survey.jsx`'s `CustomGroupsSection`
now persists through these instead of `localStorage.setItem` directly; the survey-load effect
does a **one-time migration**: if the backend has zero groups for a survey but this browser's
localStorage still has some (pre-existing data from before this table existed), they're
pushed up to the backend automatically on next load rather than silently orphaned. A small
inline error banner (`saveError` state in `CustomGroupsSection`) now surfaces a failed save,
where before a `try{}catch{}`-wrapped `localStorage.setItem` could only ever silently no-op.

**Edge Function deploy hit an unrelated, real esm.sh CDN issue**: `supabase functions deploy
save-survey` failed twice with `Module not found ".../@supabase/auth-js@2.112.0/denonext/
auth-js.mjs"` — confirmed via direct `curl` that esm.sh's currently-resolved `@supabase/
supabase-js@2` (2.112.0) has a broken `denonext`-target build for that exact pinned
sub-dependency version, unrelated to anything in this change (the same floating `@2` import
is used by the already-deployed `admin-users` function). Confirmed `2.111.0` resolves cleanly
via curl and pinned `save-survey`'s import to that exact version rather than the floating
range, with a comment noting it's safe to float again once esm.sh's CDN catches up. Deploy
succeeded after that; `admin-users` was left untouched since it wasn't being redeployed here,
but its next deploy could hit the same wall until esm.sh resolves it.

**Verified end-to-end**, all read-only or on disposable/cleaned-up data:
1. Backfill correctness: row counts *and* full content (name, feed_sequence_ids) compared
   between the jsonb source and the new table for all 18 real groups across the 3 real
   surveys with groups — zero mismatches.
2. `assign_experiment_group` RPC against a disposable throwaway survey (not the real Prebunk
   surveys): round-robin gA→gB→gA across 3 sessions, retry for an already-assigned session
   correctly returned the cached group without incrementing the counter or inserting a second
   row. Cleaned up, zero rows left.
3. Read-merge path through the **real running app** (not hand-rolled SQL): dynamic-imported
   the live `utils-backend.js` in the browser console (participant-facing `getSurveyFromBackend`,
   no admin login involved — this path is public/anon by design) against the real "Prebunk
   Paper Study 1 - Main" survey, confirmed all 6 real groups round-trip correctly from the new
   table through the app's own code.
4. `save-survey`'s sync logic (delete+reinsert + definition-stripping) and
   `supabaseSaveCustomMeasureGroups`' identical idiom: the Edge Function itself couldn't be
   invoked live (needs a real owner JWT; login is off-limits per this file's standing rule) —
   instead directly replicated its exact operation sequence via `supabase db query --linked`
   against a disposable survey, including a simulated "second save" that renamed/added/removed
   groups, confirming the resync (not just the initial insert) works, and confirmed
   `definition ? 'experiment_groups'` is `false` after a simulated save. Re-loaded the same
   disposable survey through the real app's `getSurveyFromBackend` afterward and got an exact
   match to what the SQL simulation produced, then called the real `assignExperimentGroup`
   through the real app against it — correctly assigned the two post-resync groups
   round-robin. Cleaned up, zero rows left (`surveys`/`experiment_groups`/
   `custom_measure_groups`/`experiment_assignments`/`experiment_group_counters`, all scoped to
   a `zzclaudetest_` prefix).
5. Re-confirmed after all of the above that the two real live surveys' group counts (6/6) and
   real assignment counts (32, 2) are byte-for-byte unchanged from before this work started.

**Not verified**: an actual admin-UI click-through of `save-survey` (editing/saving a real
survey's experiment groups or adding a custom measure group through the browser) — same
admin-login limitation as elsewhere in this file. The Edge Function's *logic* was verified by
direct SQL replication (point 4 above) and it type-checks (`deno check`) and deploys cleanly;
what's unverified is specifically "does clicking Save in the real browser, with a real JWT,
produce the same result" — worth a real click-through next time there's admin access.

**`.claude/launch.json` recreated locally for this session's dev-server verification** (it was
deleted from the repo in a past session — see the Projects→Platform→Dashboard flow section's
pointer above). Left untracked/uncommitted on purpose per that earlier note ("recreate locally,
don't recommit without asking") — flagging here in case this session's auto-commit sweeps it up
anyway; delete it again or ask before keeping it tracked.

## Page blocks: reordering didn't affect the questions list, and blocks were invisible there (2026-08-03)

User-reported: reordering blocks (or pages within/across blocks) in the "Study overview" modal's
Page blocks editor had no visible effect on the "Pages and questions" list, and that list showed
no indication of block membership at all.

**Root cause**: two genuinely separate data paths that happened to look related.
`page_blocks[].page_ids` (edited by `PageBlocksEditor`) is what actually determines
participant-facing page order — `materializePagesFromBlocks` (utils-survey.js) iterates blocks in
array order, each block's own `page_ids` in order, completely ignoring `survey.pages`' own array
order. But the "Pages and questions" list (both the main per-question-card editor and the Study
overview modal's outline list) is built by `flattenSurveyPagesForEditor`, which reads
`survey.pages` directly in **raw stored array order** — never consulting `page_blocks` at all. So
moving a block, or a page within/across blocks, silently changed the real delivery order while the
admin's own editing view kept showing the old, now-stale order — with zero indication a block
structure even existed, since nothing in that list ever rendered block membership.

**Fix 1 — reordering blocks now reorders `survey.pages` to match.** `PageBlocksEditor`'s
`applyBlocks` (the single choke point every block/page-order action — `moveBlock`,
`movePageWithinBlock`, `movePageToBlock`, `addBlock`, `deleteBlock` — already funneled through)
now also recomputes `survey.pages` as `normalizedBlocks.flatMap(b => b.page_ids)` mapped back to
page objects, so the "Pages and questions" list is derived from the same order that actually
matters. Every block/page action gets this for free since they all go through `applyBlocks`;
non-order actions (renaming a block, toggling randomize/group-visibility) are no-ops for this
since `page_ids` doesn't change.

**Fix 2 — block membership is now visible directly in the questions list.** New shared helpers
`computePageNumbersForQuestions`/`computeBlockBoundariesForQuestions` (exported from
`components-admin-surveys-editor.jsx`, next to the existing `normalizeSurveyPageBlocks`) and a
`BlockBoundaryDivider` component, used by **both** the main editor's "Pages and questions" list
and the Study overview modal's outline list (previously would have been a third near-duplicate
implementation if built separately — written once, imported by both). A divider ("Block N: Title",
plus "Pages randomised"/"Visible to N groups" chips when set) renders right before the first item
of any page whose block differs from the previous page's block. **Deliberately suppressed when a
survey has only the implicit single default block** (`normalizeSurveyPageBlocks`' own
no-blocks-defined fallback, "All pages"/"Survey pages") — since that covers the vast majority of
surveys that never touch this feature at all, showing a divider there on every survey would be
pure noise for a feature almost nobody uses.

**Verified**: both changed files parse clean. Since exercising this live would need clicking
through the real admin editor (blocked by the standing no-login rule elsewhere in this file), the
pure logic was verified instead by dynamic-importing the real
`components-admin-surveys-editor.jsx` module in the browser console (no backend/auth involved —
these are pure functions over a plain JS object) against a fabricated 3-page, 2-block survey with
blocks deliberately out of the pages' raw storage order: confirmed `applyBlocks`' reorder logic
produces exactly the block-order-matching page sequence, and confirmed
`computeBlockBoundariesForQuestions` places dividers exactly at the two real block transitions and
nowhere else (including correctly placing a divider on a page-break row when the page immediately
following it starts a new block, and not before a same-block page change). Separately confirmed
zero dividers for a plain single-block survey. **Not verified**: an actual click-through dragging
blocks/pages in the real browser — logic-level verification only.

## Admin dashboard UX/UI overhaul: nested navigation + questions editor polish (2026-08-03)

Prompted directly: "shouldn't Feed Participants/Survey Participants be subpoints of Feeds/Surveys?"
plus "much room for improvement... especially within questions." Full plan (context, decisions,
verification approach): `~/.claude/plans/tender-whistling-otter.md`. Two Explore agents mapped the
existing nav/routing and the questions editor's structure/gaps before any code was written; a Plan
agent then produced the file-by-file design this section describes.

**Nav restructure.** Surveys already had the shape the user wanted — `AdminSurveysPanel`
(`components-admin-surveys.jsx`) is a master-detail split (list left, tabbed detail right:
Setup/Pre-feed/Questions/Launch) — it was just missing a Participants tab. Feeds did not: it was a
flat table, with Posts and Feed Participants as separate top-level pages implicitly operating on
whichever feed was "loaded" via a `feedSwitcher` dropdown in the sidebar.

- **New `src/admin/ui/Tabs.jsx`** — extracted verbatim from the `role="tablist"` block that used to
  be hand-rolled inline in `components-admin-surveys.jsx`. Also promoted `RoleGate` (previously a
  private helper in `components-admin-dashboard.jsx`) to `src/admin/ui/RoleGate.jsx` — the new
  Feeds panel needed it too.
- **`SurveyParticipantsPage`** (`components-admin-participants-survey.jsx`) gained optional
  `surveyId`/`onSurveyIdChange`/`embed` props. When controlled (passed a `surveyId`), it skips its
  own survey-list fetch and "remembered survey" `localStorage` bookkeeping, and swaps its
  `PageHeader`+picker for a compact Refresh/Download-CSV toolbar row. `AdminSurveysPanel` now has a
  5th tab, "Participants", rendering it embedded and scoped to whichever survey is already
  selected — no re-picking. The "Save Survey" footer button is hidden on this tab.
- **New file `src/admin/components-admin-feeds.jsx`** (`AdminFeedsPanel`) — the Feeds equivalent of
  `AdminSurveysPanel`'s layout: a filterable feed list on the left (the old `showAllFeeds` toggle
  is gone, replaced by a plain client-side name/id filter always over the full list), a tabbed
  detail pane on the right once a feed is selected (**Posts** — today's Posts page content, plus
  the Save button now unambiguous since there's exactly one selected feed; **Participants** —
  `FeedParticipantsPage`, already fully props-driven so it needed zero internal changes;
  **Settings** — identity, make-default, participant stats, the 5 randomize toggles shown directly
  instead of cramped in a `Popover`, copy-participant-link, delete). All backend-fetch/caching
  logic (checksum-aware post caching, S3 snapshotting) stayed in `AdminDashboard`
  (`components-admin-dashboard.jsx`) — too entangled to safely relocate — with ~10 previously
  inline JSX handlers (`handleSaveFeed`, `handleDeleteFeed`, `handleSetDefaultFeed`,
  `handleCopyParticipantLink`, `handleSetWipePolicy`, `handleRefreshPosts`,
  `handleExportPostsJson`, `handleExportFeedPdf`, `handleImportPostsJson`, `handleRenamePost`,
  `handleOpenRandomPost`) extracted into named functions and passed down as props. **One
  confirmed, deliberate behavior change**: the old Feeds table let you "Save" the current editor's
  posts into a *different* feed than the one loaded (a cross-save escape hatch, with a
  `confirm()` guard) — dropped, since it's ambiguous in a one-feed-at-a-time view; Save now always
  targets the selected feed only.
- **Sidebar nav** (`AdminShell.jsx`) collapsed from 6 items (Feeds/Posts/Surveys/Feed
  Participants/Survey Participants/Users) to 3 (Feeds/Surveys/Users); the `feedSwitcher` sidebar
  dropdown was deleted outright (not repurposed) since Feeds itself is now the picker. Old routes
  (`posts`, `participants`, `participants/feed`, `participants/survey`) became explicit
  `<Navigate>` redirects to `feeds`/`surveys` rather than relying only on the wildcard, so stale
  bookmarks land somewhere sensible.

**Questions editor polish** (`components-admin-surveys-editor.jsx`, all additive/corrective, no
data-model restructuring):
- **Search/filter** — new input above "Pages and questions" in the Study overview modal (the one
  place both a compact list and that framing already live). New exported `matchesQuestionFilter(item,
  query)` matches on id/text(HTML-stripped via the existing `stripHtmlForEmptyCheck`)/type,
  page-break rows always pass through for structural context. Implemented as a render-skip
  (`if (!matchesQuestionFilter(...)) return null` inside the existing `.map`), deliberately **not**
  a pre-filter of the array — `flatIndex`/`onMoveUp`/`onDuplicate`/etc. are all keyed on the true
  index into the underlying data, and pre-filtering would have silently corrupted every one of
  them.
- **Duplicate-question-id warning** — new exported `computeDuplicateQuestionIds(questions)`
  (a `Set` of ids used more than once, page-break rows excluded). Previously only the
  auto-generated Copy path avoided id collisions; a manually-typed duplicate id had zero warning,
  despite `visible_in_feeds`/`feed_overrides`/`visible_to_group_ids`/CSV columns all keying off it.
  Wired into `QuestionCard`/`CollapsedQuestionRow` (main editor) and `OutlineRow` (Study overview
  modal) — red border/text plus a tooltip and, in the expanded card, an inline warning line.
- **Group-visibility orphan cleanup for questions** — `ExperimentGroupsEditor.deleteGroup` already
  stripped a deleted group's id from every block's `visible_to_group_ids`; extended the same
  function (using the already-exported `getQuestionList`/`setQuestionList`) to also strip it from
  every question's `visible_to_group_ids`. This only *removes* entries from an already-existing
  field — no new stored shape — so the repo's "N places to update" duplicated-reconciliation
  footgun documented elsewhere in this file doesn't apply here.
- **`PageBlocksEditor` collapsed-by-default** — renamed/inverted its `collapsedBlockIds` scheme to
  `expandedBlockIds` (inclusion = expanded, starts empty), matching the convention
  `ExperimentGroupsEditor` already used for its own per-group panels. Any block added later is
  correctly collapsed by default too, with no extra bookkeeping.

**Not in this pass**: a `visible_if` (conditional question display) builder UI — confirmed via
direct code search that no editor surface exists for this at all today (the field is only ever
blindly copied through on duplicate/type-change, set/read purely at the data layer). Flagged as a
recommended, separately-scoped follow-up — meaningfully larger surface area and risk than anything
else in this pass.

**Verified**: every touched/new file parses clean (`@babel/parser`) and the whole module graph
loads with zero errors via cache-busted dynamic imports against the real running dev server
(confirmed via `read_network_requests` too — every request 200s; a batch of `[vite] Failed to
reload]` console messages seen mid-session turned out to be stale buffered history from
transient mid-edit states, not a current problem, confirmed by checking Vite's own server-side
logs showed nothing and by re-fetching the exact files fresh). A prop-shape audit
(`AdminFeedsPanel`'s 44 expected props vs. what `AdminDashboard` actually passes) found zero
mismatches. The three new pure helpers (`matchesQuestionFilter`, `computeDuplicateQuestionIds`,
and the orphan-cleanup updater logic) were exercised directly against fabricated data via the
browser console — no login needed, all pure functions over plain objects — and all produced
exactly the expected output. **Not verified**: an actual click-through in the live admin panel
(selecting a feed, saving, toggling randomize flags, viewing the new Participants tabs, dragging
questions with the filter active) — this needs a real admin session, which stays off-limits per
this file's standing rule. Worth a full click-through next session before trusting this is
pixel/behavior-correct beyond what static analysis and pure-logic testing can confirm.

**Status at end of session: committed (`5c7a2e7 redesign of navigation and survey editor`) and
confirmed pushed** (`git status` clean, `HEAD` == `origin/main`) — given this repo's
auto-deploy-on-push pipeline, treat this as already live on `studyfeed.org` unless proven
otherwise. Full status, what to do first if picking this back up, and one deliberate deviation
from the original design (flat props on `AdminFeedsPanel` instead of grouped
`feedActions`/`postActions` objects, chosen so the prop-shape audit above could be a mechanical
flat-list diff) are all in the plan file's "Status" section at the top —
`~/.claude/plans/tender-whistling-otter.md`. **One loose end from this session, unresolved**:
`.claude/launch.json` (recreated mid-session for browser-based verification, no secrets) got
swept into this session's auto-commit despite being flagged untracked-on-purpose earlier in this
same file — harmless, but the user hasn't said whether to keep it tracked or remove it; ask
rather than deciding unilaterally if it comes up again.

## One-off incident: CLAUDE.md itself got deleted mid-session (2026-08-01)

During the admin dashboard redesign work, this file was found deleted from the working directory
(not modified — gone) partway through a session, with no corresponding edit/delete tool call to
explain it. It was recovered with `git checkout HEAD -- CLAUDE.md` (it was committed and clean at
the time, so nothing was lost). Cause unknown — happened in the same window as several `npm run
dev` attempts and one `rm -rf node_modules/.vite`, but no causal link was established. Mentioning
this so that if a repo file mysteriously vanishes again, it's known to have happened once before
and `git checkout HEAD -- <file>` is the fix if the file was committed.

## Admin dashboard: merged tree-sidebar navigation + toolbar cleanup (2026-08-03)

Follow-up to "Admin dashboard UX/UI overhaul" above, prompted directly by the user: "the survey
list design isn't exactly the same as the [feed] list design... there is not much space for any
of the pages because 40% are taken up by the navigation + survey or feed list." Ran through
several rounds of direct visual feedback the same day — plan file
`~/.claude/plans/tender-whistling-otter.md` has a pointer to this section at its top; treat this
section as the current design, that file's §3 (Feeds list column) as superseded history.

### Round 1: merged nav + list into one sidebar

Explored three options with the user (collapsible list panel, icon-only nav rail, merged tree
sidebar) before building — chose the merged tree sidebar: instead of a 240px nav column *and* a
separate 280px list column (520px of fixed chrome before any content), `AdminShell.jsx` now owns
a single ~280-288px sidebar where "Feeds" and "Surveys" are expandable tree sections. Clicking one
navigates there and shows its list inline, right under the header — no separate list column at all.

**Mechanism**: `AdminFeedsPanel`/`AdminSurveysPanel` don't get their list-owning state moved
anywhere — `AdminSurveysPanel` in particular owns a large, self-contained ~3000-line state machine
that would have been risky to partially lift into `AdminDashboard` just for this. Instead, a new
`AdminTreeSlotsContext` (exported from `AdminShell.jsx`) exposes the sidebar's slot DOM nodes;
each panel portals its own list-rendering JSX (`FeedListContent`/`SurveyListContent`, extracted
from what used to be inline in the return statement) into the matching slot via `createPortal`.
Same portal-into-`.admin-shell` rationale as `src/admin/ui/Popover.jsx`. Only *where* the list JSX
renders changed; who owns the data behind it didn't.

**A real, non-obvious Vite dev-server gotcha hit while verifying this, worth remembering for any
future console-based verification in this repo**: Vite rewrites every relative import in
transformed source to include a per-file cache-busting timestamp query
(`from "/src/admin/AdminShell.jsx?t=1785753640960"`), computed consistently for *all* importers of
that target file. A manual browser-console `import('/src/admin/AdminShell.jsx')` (bare, no
timestamp) is a **different URL** to the browser's ES module registry than the timestamped one the
real app's modules resolve to internally — meaning `AdminTreeSlotsContext` (a `createContext()`
result) becomes two structurally-different objects, and `useContext` silently reads the *default*
value instead of the real Provider's value, with zero console errors. This produced several
convincing-looking false negatives before being diagnosed. **Fix for future verification**: fetch
the already-transformed source of one file, regex out the exact timestamped URL it uses for a
relative import (`` const url = (await fetch(path).then(r=>r.text())).match(/from "(\/src\/...\?t=\d+)"/)[1] ``),
and import *that* URL directly — guarantees the same module instance the real app graph uses.
Also: the browser's ES module cache is permanent per page load per exact URL string — reusing the
same tab across many test iterations without reloading silently serves stale pre-edit module
instances; when in doubt, reload the page first.

**A real, already-authenticated admin session was found in the shared dev browser mid-session** —
not something this session logged into (no credentials were entered, ever). Confirmed by
`get_page_text` unexpectedly showing real project names (`Community Notes Paper`, `Misinformation
Prebunking Paper`, etc.) instead of the login form. Backed out immediately (navigated away,
cleaned up test DOM nodes) without clicking anything beyond that one accidental read — no data was
viewed beyond project *names* on the picker screen, nothing was created/edited/deleted. Worth
flagging to the user in a future session: this shared browser profile appears to retain a valid
Supabase session across page loads/reloads, so a future session could stumble into the same
real-data exposure risk without intending to authenticate at all.

### Round 2: cleanup, per direct user feedback on the round-1 result

Several concrete complaints, each fixed:
- **Real CSS bug, not just clutter**: `feedListButtonStyle`/`surveyListButtonStyle` used
  `width: 100%` plus padding with no `box-sizing: border-box`, so every row rendered ~28px wider
  than its container — visually colliding with the sidebar's scrollbar. Added `box-sizing:
  border-box` to both.
- **Collapse toggle folded into the section button itself** (`components-admin-feeds.jsx`/
  `AdminShell.jsx`'s `TreeSection`) — round 1 had a separate small chevron button next to the nav
  link, which the user couldn't reliably click. Now the "Feeds"/"Surveys" `NavLink` itself handles
  both jobs: clicking it navigates there if not already active, or toggles its own list
  open/closed if already active (`e.preventDefault()` + a manual toggle callback instead of
  letting the click re-navigate to the same route). `expandedKey` state resets to match whichever
  section is active whenever the route changes, so collapsing Feeds then navigating to Surveys
  doesn't leave Surveys confusingly pre-collapsed too.
- **Removed entirely, per direct request**: the filter/search input on both lists, the
  "Updated <date>" second line on feed rows, and the "draft" badge on survey rows.
- **"Wipe on change" relocated, not removed** — moved from the Feeds list-column toolbar into a
  new "Danger zone" section on each feed's own Settings tab (`components-admin-feeds.jsx`),
  alongside "Delete feed". Still the same project-scoped backend call
  (`getWipePolicyFromBackend`/`setWipePolicyOnBackend` take no `feedId`) — it just reads oddly as
  "project-wide policy shown while looking at one feed," a tradeoff accepted since there was no
  other natural home for it once the dedicated list-column toolbar was gone.
- **Logout moved from an awkward full-width button at the very bottom of a now much-shorter nav**
  to a small ⏻ icon next to the project title at the top of the sidebar.
- **New feature: "Copy feed"** (`components-admin-dashboard.jsx`'s `copyFeed`, mirroring the
  existing `createNewFeed` exactly) — prompts for a new feed ID/name, duplicates the
  currently-loaded feed's `posts` array and CSV post-names map into it, adds it to the local feed
  list. Like `createNewFeed`, it's pure client-state until "Save" is clicked, no new backend call.
  **Copied posts deliberately keep their original bare post ids** — this is the exact
  Control/Treatment-variant-from-a-shared-template pattern the `posts.id` composite-key migration
  (see "Backend migration" section above) was built to support, not an oversight.
- **Toolbar decluttering, both panels**: Feeds' Posts-tab toolbar had "Export JSON"/"Export Feed
  PDF"/"Import JSON" moved into a new "Import / export" card in Settings, renamed to "Export
  Feed"/"Export PDF"/"Import Feed"; the per-post-row actions dropped the "Rename" button entirely
  (redundant with the "Post name" field already in the post editor's Basics section) and replaced
  "Edit"/"Delete" text buttons with icon buttons. Surveys' top toolbar had "Import"/"Export
  JSON"/"Copy" moved into the Setup tab's "Survey details" card header (renamed "Import
  Survey"/"Export Survey"), and "Ethics Word"/"Ethics PDF" moved into the Launch & completion tab
  — the top toolbar now only shows the survey name, feed/page counts, and the delete icon.
  Instagram's Media-column post-type indicator ("🎬 video"/"🖼️ image") dropped the emoji, since the
  Actions column already has real icons and the pairing read as noisy.

**Verified**: all touched files parse clean (`@babel/parser`). Given the real-admin-session
discovery above, verification leaned harder than usual on rendering the actual production
components (not mocks) with fabricated data through the real dev server, via the timestamped-URL
technique described above — confirmed end-to-end: the folded collapse toggle expands/collapses
without navigating, the logout icon fires `onLogout`, "Copy feed" fires `onCopyFeed` and the
Settings tab shows the renamed Import/Export/PDF buttons and the relocated Wipe-on-change toggle,
and the Media column renders plain "image"/"video" text. **Not verified**: an actual click-through
in the live admin panel by a real logged-in user — still off-limits per this file's standing rule,
and now doubly worth being careful about given the stray authenticated session noted above.

**Status at end of session**: `git log` shows this round's work already auto-committed and pushed
to `origin/main` (commits `cba513e`, `10cd5db`, `68f93a0`, `89d8bb0` — "rebuild navigation and list
structure" through "button cleanups") — confirmed via `git status`/`git rev-parse HEAD` vs
`origin/main` matching at end of session, no manual commit/push performed by Claude.

## Instagram: carousel arrows, per-image captions, repost button, reminder text fixes (2026-08-03)

Four rounds of direct, mostly-unrelated Instagram feedback the same day, handled as one thread
since they touch the same core files (`ui-posts-instagram.jsx`, `ui-core/ui-ig-carousel.jsx`).

### Carousel arrows: style, then real/last-slide visibility

First pass (style only): the desktop carousel's prev/next buttons (`.igcar-arrow`,
`src/styles-instagram.css`) were plain dark circles with **no chevron glyph inside them at all** —
just an empty `background: rgba(0,0,0,.45)` button, confirmed by reading the CSS (no
`::before`/`::after`, no child content in the JSX). Fixed to a light `rgba(255,255,255,.9)` circle
with a real inline SVG chevron (`stroke="currentColor"`, dark grey) inside each button
(`src/ui-core/ui-ig-carousel.jsx`), matching real Instagram's look.

Second pass, from a screenshot of a real Instagram post: the **first slide shouldn't show a left
(previous) arrow at all**, and symmetrically the last slide shouldn't show a right (next) one —
round 1 always rendered both whenever there was more than one image. Fixed by conditionally
rendering each arrow (`idx > 0` for left, `idx < items.length - 1` for right) instead of gating
both on a single `hasMany` flag.

### Removed the "less" collapse link from Instagram captions only

Per direct request: Instagram's "... more" truncation link should stay, but there should be no way
back to collapsed ("less") — unlike Facebook and Amazon, which keep their own collapse links
unchanged. Removed the `wasClamped`-gated "less" `<button>` and the now-dead `wasClamped` state
from `PostText` in `src/ui-core/ui-core-instagram.jsx` only; `ui-core-facebook.jsx`'s "See less"
and Amazon's `ReadMoreText` "Read less" are untouched.

### New feature: per-image carousel captions

Each image in an Instagram carousel can now carry its own `caption`, shown instead of the post's
own caption while that specific image is in view, falling back to the post's caption for any slide
that doesn't have one set.

- **`src/ui-core/ui-ig-carousel.jsx`**: `IGCarousel` gained an optional `onIndexChange(idx)`
  callback (fires from a `useEffect` watching its existing internal `idx` state) — lets the parent
  react to slide changes without needing to own/control the carousel's index itself.
- **`src/ui-posts/ui-posts-instagram.jsx`**: `PostCard` tracks `carouselIdx` (must be declared
  *before* `imgs`/`hasCarousel`/the caption-selection logic that reads it — a real "cannot access
  before initialization" bug was hit and fixed here, see Verification below) and computes
  `captionText = imgs[carouselIdx]?.caption?.trim() ? imgs[carouselIdx].caption : text`, used
  everywhere the caption row previously used the raw `text` prop. Swiping resets `expanded` to
  `false` (a long caption expanded on one slide shouldn't stay expanded, and thus unclamped, after
  swiping to a different slide with a different caption).
- **`src/admin/components-admin-media-instagram.jsx`**: `CarouselEditor` gained a "Caption for
  image N" text field next to the existing focal-point cropper, writing `caption` onto the
  selected image object. **No backend change needed** — confirmed `images` round-trips as an
  opaque JSON array on both read and write (`mapPostRowToRaw`/`mapRawPostToRow` in
  `utils-backend-supabase.js` just do `Array.isArray(row.images) ? row.images : []`, no
  per-field reconstruction), so a new sub-field can't be silently stripped the way CLAUDE.md's
  other "N places to update" footguns work.

### New feature: Instagram repost button, tracked/analysable like like/comment/share

Real Instagram now has a repost button between Comment and Share; the user wants the same button,
tracked and analysable the same way as the existing engagement measures.

- **UI** (`ui-posts-instagram.jsx`): new `RepostIcon` (a repeat/cycle glyph, turns `#00c853` green
  when active — matches the retweet-style green convention other apps use for this), a `reposted`
  toggle state, `toggleRepost` firing `onAction("repost"/"unrepost", {post_id})` exactly like
  `toggleSave` does for Save. Positioned between the Comment and Share buttons in the actions row.
- **Tracking is deliberately sticky (once-true), not a live toggle** — `utils-core.js`'s
  `makeEmptyPostInteractionAggregate()`/`applyPostInteractionEvent()` gained a `reposted` field
  with only a `case "repost": p.reposted = true;`, **no** `"unrepost"` case, matching how
  `saved`/`shared`/`commented` already behave (the aggregate answers "did this happen at least
  once," not "final on/off state" — only `reaction_type` is a true toggle, because it's a
  type-selector, not a plain boolean). The raw event log still records "unrepost" when a
  participant un-reposts (full fidelity), same as "unsave" already does for Save; it's just not
  specially summarized. (Caught and reverted an earlier mistake here: an `"unsave"` case doesn't
  currently exist either, and one was briefly and wrongly added as part of this work before being
  removed — would have silently changed existing Save-tracking behavior no one asked to change.)
- **CSV/analysis parity — added `_reposted`/`"reposted"` everywhere the equivalent `_saved` field
  already appears, all IG-gated the same way**, since this codebase's "N places to update"
  duplicated-field-list footgun applies here too:
  `buildParticipantRow` (`utils-core.js`, the main per-post CSV columns),
  `REMINDER_INTERACTION_FIELDS` (`utils-backend.js`, the curated columns for an *interactive*
  post_reminder question), `IG_ONLY` + `parsePostMetricKey` + `normalizeRowsForCsv`'s `BOOL_SUFFIX`
  regex + `isRelevantPostMetricForExport` (`components-admin-participants-feed.jsx`, the Feed
  Participants engagement page), and `POST_METRIC_SUFFIXES_FOR_LABELS`
  (`components-admin-surveys.jsx`, multi-feed CSV header labels). Deliberately **not** added to
  `ENGAGEMENT_SERIES` (the Reacted/Commented/Shared % bar chart in
  `components-admin-participants-feed.jsx`) — `_saved`, the closest existing IG-only precedent,
  isn't in that chart either, so leaving Reposted out too matches the established convention of
  keeping that specific chart to universal (all-app) metrics only.
- Interactive post_reminder questions pick up repost tracking **for free, no extra wiring** —
  confirmed `PostReminderCard`'s `handleInteractiveAction` (`ui-survey.jsx`) is fully generic, just
  forwarding whatever `onAction(action, meta)` the real `PostCard` fires into the same
  `applyPostInteractionEvent` reducer used everywhere else.

### Non-interactive post reminders: show full text, no "more"/"less" at all, on every app — **uncommitted at end of session**

Separate, later request: static (non-interactive) `post_reminder` questions should show the
complete caption/review text always, on Facebook/Instagram/Amazon alike — no clamp, no "more," no
"less." Interactive reminders and the real feed are unaffected (both should keep behaving exactly
like the live feed, which is the whole point of "interactive").

- New `alwaysExpandText` prop on `PostCard` in all three `ui-posts-*.jsx` files. Facebook/Instagram
  (DOM-measurement-based clamp): forcing the internal `expanded` state permanently `true` means
  the `clamp` CSS class never applies, so the clamp-detection effect never finds real overflow in
  the first place — both "more" and "less" disappear as a natural consequence, no extra logic
  needed. **Amazon needed one more line**: its clamp (`ReadMoreText`) is purely
  character-count-based (`text.length > 520`), independent of `expanded` — forcing `expanded` true
  alone would still have left "Read less" rendering, since `needsClamp` doesn't care about
  `expanded`. Fixed by also forcing `needsClamp` to `false` when `alwaysExpanded` is set.
- **`ui-survey.jsx`** (desktop) and **`ui-survey-mobile.jsx`** (mobile) — both `PostReminderCard`
  variants now pass `alwaysExpandText={!interactive}` to the real `PostCard` they render,
  alongside the existing `disabled={!interactive}`. Same near-duplicate-file footgun as the rest of
  this reminder machinery — checked both from the start rather than fixing one and finding the
  same gap reported for the other later.
- **This round's five files were still uncommitted when the session ended** (`git status`:
  `ui-survey.jsx`, `ui-survey-mobile.jsx`, `ui-posts-amazon.jsx`, `ui-posts-facebook.jsx`,
  `ui-posts-instagram.jsx` all modified) — unlike every other change in this section, which `git
  log`/`git rev-parse` confirmed already auto-committed and pushed to `origin/main` (`100b232 implement
  new carousel function`, `777b276 add repost functionality`). If a future session finds these
  still uncommitted, that's expected — nothing was lost, just not yet swept up by whatever this
  session's auto-commit trigger is (see "Deployment" section's caveat that this depends on the
  user's own GitHub Desktop app being open/attended).

**Verified, all four rounds**: every touched file parses clean (`@babel/parser`). All functional
behavior verified by rendering the real `PostCard`/`IGCarousel` components (not mocks) with
fabricated post data through the actual dev server — confirmed live: arrow visibility flips
correctly across first/middle/last slide; per-image captions swap correctly on navigation
(including the no-caption-set fallback case) with zero console errors after fixing the
initialization-order bug; the repost button renders in the correct position, toggles color/label,
and a hand-built event stream through the real `buildParticipantRow` produced the expected
`p1_reposted: 1` CSV column; static-reminder mode shows full text with zero "more"/"less" controls
on all three apps while normal mode still clamps as before. **Not verified**: real click-through
inside an actual survey preview/live feed — same standing limitation as everywhere else in this
file (no admin login, no way to drive a real participant session end-to-end from here).

## Admin user management rework + project access control (2026-08-04)

Two direct-feedback items handled together, run mostly overnight while unattended: (1) "the users
page needs an entire refresh... it would be better placed before we even go to a project... manage
which projects they have access to and which platform and which feeds even perhaps," and (2) "the
settings page on feed also needs to be redesigned... some things like the randomize sliders only
take up the left half of the box." Two more direct-feedback follow-ups the same day, once the user
was back at the keyboard: "the role selection could be more elegant" and "implement a username...
the email is quite long" — see their own subsection near the bottom of this entry.

**DB migration status, resolved**: `supabase db query --linked -f` (the established process this
repo uses for schema changes) was blocked by Claude Code's own auto-mode permission classifier
overnight when unattended — a direct write to the live production database, correctly gated with
no one present to approve it. Once the user was back and ran it themselves from the repo directory
(the first attempt failed with "Cannot find project ref" because it was run from `~` — the
`supabase link` state lives in `supabase/.temp/` inside the repo, not globally, so the command has
to run from inside `social-media-environment/`), **`20260801000016_project_access.sql` applied
successfully and is live**. Confirmed via `to_regclass('public.project_access')` returning
non-null. Same evening, back in an attended session, `supabase db query --linked -f` for the
username migration below went through on the first try with no permission block at all — the
overnight block was specifically about running unattended, not about the command itself.

### Users page: moved out of the per-project dashboard, rebuilt as a real access-control page

**Root problem wasn't just visual.** The old `AdminUsersPanel` (`components-admin-users.jsx`) was
mounted as a tab three navigation levels deep (project → platform → dashboard → Users), which
misrepresented what user accounts actually are: `profiles.role` is global, never project-scoped
(confirmed already in `20260801000002_profiles.sql`'s own comment) — so burying account management
inside one particular project's sidebar was structurally wrong, not just cluttered. The "Add user"
form was a permanently-open 3-column fieldset with a full-width primary button below it, and the
existing-users table used three `prompt()`/`confirm()` dialogs (change role, reset password,
disable) instead of real UI.

**Moved**: new top-level route `/admin/users` (`AdminEntry.jsx`), reachable via a "Manage users"
button (owner-only) on `AdminProjectPicker` — i.e. from the *project picker*, before any project is
chosen, matching "before we even go to a project" exactly. `AdminShell.jsx`'s per-project sidebar
no longer has a Users nav item at all; the old `/admin/dashboard/users` path now redirects to
`/admin/users` for stale bookmarks (`components-admin-dashboard.jsx`).

**Rebuilt** (`components-admin-users.jsx`, full rewrite, `AdminUsersPage` replacing
`AdminUsersPanel`) as a master-detail page matching the Feeds/Surveys panels' own visual language:
a left column of user rows (email, role badge, disabled badge, project-access summary badge) and a
right detail pane for whichever user is selected. Role changes are now a plain `<select>` that
applies on change (no `prompt()`), password reset and "Add user" are real modal dialogs (new
**`src/admin/ui/Modal.jsx`** — portals into the nearest `.admin-shell` ancestor rather than
`document.body`, same reasoning as `Popover.jsx`: the `--admin-*` tokens in `ui/tokens.css` are
scoped to `.admin-shell` and render invisibly past that boundary), and "Account enabled" is a real
`Toggle` instead of a button whose label was the only indicator of current state. An owner can't
delete their own account from this UI either (button disabled + tooltip) — the Edge Function
already enforced this server-side (`admin-users/index.ts`), this just surfaces it before the click
instead of after a failed request.

### New feature: per-user project access (`project_access` table + RLS)

This is genuinely new, not a port of existing GAS behavior — GAS/Sheets never had project-scoped
admin accounts either (see the profiles-table comment above), so this was a real design decision,
not a mechanical rebuild.

- **`project_access(id, user_id, project_id, apps text[])`** — one row per (user, project) grant.
  `apps = '{}'` (the default) means every platform for that project; a non-empty array narrows it
  to specific fb/ig/amz platforms.
- **Deliberately opt-in, not opt-out — chosen specifically to make shipping this a no-op for every
  existing account.** A user with **zero** `project_access` rows keeps today's behavior exactly:
  sees every project, on every platform. Restriction only kicks in once an owner explicitly grants
  that user a specific set of projects. Confirmed via `supabase db query --linked` before writing
  the migration that only one real profile exists in production right now (the owner account,
  which bypasses all of this anyway) — so there was zero lockout risk in the design, not just in
  theory.
- **RLS enforcement, real but intentionally scoped to two tables, not the whole schema.**
  `has_project_access(pid)` and `has_project_app_access(pid, app)` (both `security definer`,
  mirroring `current_profile_role()`'s existing pattern) gate `projects_select_admins` (replacing
  the policy from `20260801000003_projects_and_feeds.sql`) and a new `feeds_select_admins` policy.
  `feeds_select_public` was split into `feeds_select_anon` (untouched `using (true)`, so real
  participants loading a study — always anonymous, never authenticated — are completely unaffected)
  and `feeds_select_admins` (authenticated admins only, now gated). **Posts/surveys/participants/
  survey_responses tables were deliberately left ungated this pass** — the admin UI never lets you
  reach those without first browsing through a project and feed you can already see, so this closes
  the primary navigation surface; a determined actor with a known feed_id and direct API access
  could still bypass deeper-table RLS. Flagging this honestly rather than overclaiming — same
  posture as every other "not yet verified" note in this file.
- **Frontend**: `supabaseListProjectAccess()`/`supabaseSetUserProjectAccess()`
  (`utils-backend-supabase.js`, plain delete+reinsert per user, same idiom already used for
  `feed_surveys`/`experiment_groups` resyncs) and `listAllProjectAccess()`/`setUserProjectAccess()`
  (`utils-backend.js`, Supabase-only — GAS branch is a plain no-op, same reasoning as
  `loadCustomMeasureGroups`). The Users page's `ProjectAccessEditor` renders an "All projects" /
  "Selected projects only" toggle, and when restricted, a checklist of every project (owner always
  sees the full list, so no separate "list all projects ignoring my own access" call was needed)
  with per-project platform chips — all three platforms highlighted by default on a freshly-granted
  project, which saves back to `apps: []` (not a literal 3-element array) specifically so a future
  4th platform is included automatically rather than silently excluded from every grant made before
  it existed.

### Feed Settings tab: 7 sparse cards → 4, randomize toggles now use the full card width

Second direct-feedback item, in `components-admin-feeds.jsx`'s `AdminFeedsPanel` Settings tab —
Identity / Participant stats / Post order / Randomize / Sharing / Import-export / Danger zone
(7 cards, several holding exactly one field or one button) consolidated into 4: **Overview**
(identity + stats + Make-default/Copy-feed actions, one header row), **Behavior** (post-order
shuffle + the 5 participant-facing randomize flags, all 6 toggles in one card), **Sharing & export**
(participant link + Export Feed/PDF/Import, one button row, editor-only buttons gated inline rather
than needing their own card), and **Danger zone** (unchanged — wipe-on-change, still owner-only).

The randomize toggles' actual complaint — "only take up the left half of the box" — was a literal
`maxWidth: 320` on a `display:"grid"` (implicitly single-column) container inside a full-width
`Card`. Replaced with `gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))"` and no
max-width, so the 6 toggles now lay out as a responsive 2-column grid filling the card, collapsing
to 1 column only on a narrow viewport. No logic changed — every `Toggle`'s `checked`/`busy`/
`disabled`/`onChange` prop is byte-for-byte the same as before, only which `Card` wraps it and the
grid CSS changed.

### How this was verified

The sandbox's `npm run dev` (see "Build/dev notes") was already running from an earlier session,
reused via a fresh browser tab rather than restarting it. Both pieces were verified against the
**real, running app** rather than mocks-in-isolation, using techniques already established
elsewhere in this file:

- **Users page**: faked a local admin session (`admin_token_v1`/`admin_role_v1`/`admin_email_v1` in
  `localStorage` — never real credentials, never typed into a form) to get past the `hasAdminRole`
  gate, confirmed the real Supabase/Edge-Function calls fail gracefully with a visible error banner
  (`missing Authorization bearer token`, `Could not find the table 'public.project_access'` —
  exactly the "table doesn't exist yet" error expected given the migration is unapplied, confirming
  the code path is correct and just waiting on the DB), then monkey-patched `window.fetch` to return
  fabricated `profiles`/`projects`/`project_access` responses and drove the real page end-to-end:
  user list with role/disabled/project-count badges, selecting a user, the `ProjectAccessEditor`
  correctly rendering an already-granted project with a partial platform restriction (2 of 3 chips
  highlighted, matching fabricated `apps: ["fb","ig"]`), checking a new project and seeing "Save
  access" appear (dirty-state detection), and the "Add user" modal rendering correctly themed
  (confirming `Modal.jsx`'s portal-into-`.admin-shell` approach works, not just in theory).
- **Feed Settings tab**: driving the full dashboard route required also mocking session-expiry
  watch and project resolution, which wasn't worth chasing down for a pure-JSX layout change — used
  a more targeted technique instead: fetched the exact timestamped module URL the running app
  currently uses for `src/admin/ui/index.js` (same "same module instance as the real app graph"
  technique documented earlier in this file under "merged tree-sidebar navigation"), imported the
  real `Card`/`Toggle`/`Button`/`RoleGate` components plus React/ReactDOM from Vite's own dep cache,
  and rendered the exact new Settings-tab JSX tree with fabricated stats/flags into a scratch node
  appended to the live page (hiding the rest of the page rather than using a separate blank tab, so
  the real `.admin-shell` CSS tokens were in scope). Confirmed visually and via `get_page_text`: all
  4 cards render with correct content, the 6 randomize toggles lay out 2-per-row filling the full
  card width (the literal complaint), and `RoleGate`-gated pieces (Behavior card, Export/Import
  buttons, Danger zone) correctly appear/disappear based on a faked `admin_role_v1` value.
- Both test sessions' `localStorage` keys and monkey-patched `window.fetch` were cleaned up
  afterward; no real data was read, written, or could have been (every fabricated response was
  synthetic, and the one real network call that did fire — `admin-users` Edge Function with a fake
  token — was correctly rejected server-side, never touching real user data).
- **Not verified**: an actual click-through with a real owner session (standing limitation
  throughout this file — no login), and the `project_access` RLS policies themselves were reviewed
  by reading, not exercised against live data, since the migration hadn't been applied at the time
  this paragraph was written (it has since, see the status note near the top of this section) —
  worth a quick `supabase db query --linked` sanity check mirroring the pattern used for the
  `posts.id` collision fix: confirm `projects_select_admins`/`feeds_select_admins` still return
  every row for the owner account (should be a no-op change for them) before trusting it further.

### Follow-up, same day: elegant role selector + display usernames

Two more direct-feedback items once the user was back at the keyboard: "the role selection could
be more elegant" and "can we implement a username... the email is quite long, so usernames would
be nice." Both confined to the Users page from the section above — no other file touched.

- **`profiles.username`** (`20260801000017_profiles_username.sql`, applied live the same session)
  — nullable, case-insensitively unique (partial index, `where username is not null`, so any
  number of accounts can simultaneously have none set). **Purely a display label, not a sign-in
  credential** — Supabase Auth sign-in stays email/password unchanged; reworking Auth's identifier
  away from email would have been a much larger, riskier change than what was actually asked for.
  Nullable and unbackfilled on purpose, same "opt-in, no-op for existing accounts" posture as
  `project_access` above — the Users page falls back to showing the email wherever `username` is
  null, so shipping this didn't require touching the one real existing account at all (it since has
  one, set live through the UI during verification — see below).
- **`admin-users` Edge Function** (`supabase/functions/admin-users/index.ts`, redeployed): `list`
  now selects `username` too; `create` accepts an optional `username` and — unlike role, which
  defaults to `viewer` when omitted — **always resolves to something**, falling back to the email's
  local part (`sanitizeUsername(email.split("@")[0])`) so no account created after this migration
  can end up without one, closing the gap the nullable column otherwise leaves open for new users;
  `update` accepts `username` too, where an explicit empty string clears it back to `null` (only a
  fully-absent key means "don't touch this field," same convention `role`/`disabled` already use).
  A Postgres unique-violation (code `23505`) on either path is caught and rewritten to "That
  username is already taken" instead of a raw constraint-error string. Type-checked with
  `deno check` and deployed via `supabase functions deploy admin-users`.
- **`components-admin-users.jsx`**: new `SegmentedControl` (a connected three-pill Viewer/Editor/
  Owner group, each with a `title` tooltip explaining what the role grants) replaces the plain
  `<select>` in both the detail panel and the Add User modal — same "why hide three options behind
  a dropdown" reasoning as `ProjectAccessEditor`'s existing "All projects"/"Selected projects only"
  pair, just generalized into a reusable component instead of copy-pasted a second time. New
  `UsernameEditor` — starts collapsed as a "Set a username"/"Edit username" link (edited rarely,
  so an always-open input would be more visual noise than the plain `<select>` it's replacing was)
  and expands into an input + Save/Cancel, Enter-to-save/Escape-to-cancel. Wherever email was
  previously the only identity shown — the list-column rows and the detail panel's `<h2>` — now
  prefers `username`, falling back to `email` when unset; when a username *is* set, the email
  drops down into a smaller secondary line instead of disappearing entirely (still needed for
  "Reset password"'s subtitle and self-detection, which stay keyed on email throughout, not
  username — email remains the actual identity join key everywhere in the data model, username is
  overlay-only). Add User modal gained a Username field between Email and Password, with a
  live-computed placeholder (`suggestUsername()`, a client-side mirror of the Edge Function's
  sanitizer, used only for the placeholder preview — the server's sanitize/fallback is what
  actually persists) and a one-line note clarifying sign-in still uses email, specifically to head
  off the natural "wait, do I log in with this now?" question.

**Verified**: `deno check` clean, function deployed successfully (`dashboard_url` returned in the
CLI's own JSON response, confirming a real deploy not just a local build). Frontend files parse
clean (`@babel/parser`). Live-rendered via the same fetch-mock-plus-fake-session technique used
earlier in this section (fresh dev-server tab, fabricated `admin-users`/`projects`/`project_access`
responses, real components/real page): confirmed a user with `username: "researcher1"` shows the
username as the bold primary line and the long email as a smaller secondary line in both the list
row and the detail heading, while a user with no username still shows the full email exactly as
before (no regression for unset accounts); clicked "Set a username" on the owner account, typed
"jasonw," saved — list row, detail heading, and the "Set a username"→"Edit username" link label
all updated reactively in the same render pass; clicked the "Editor" segment on the role control —
applied immediately and the list-row role badge updated to match, confirming the new control fires
the same `changeRole` handler the old `<select>` did, unchanged; opened the Add User modal and
typed an email, confirmed the Username field's placeholder live-tracked it
(`new.person@example.com` → placeholder `new.person`). **Not verified**: the real Edge Function against a real owner JWT (same standing no-login
limitation as everywhere else in this file) — the mocked verification above proves the frontend
wiring is correct and that the function deploys and type-checks, not that the deployed function
behaves identically when actually invoked with a real session. The one real production profile
(the owner account) does **not** have a username set — nothing in this session touched real
`profiles` rows; every "jasonw"/username save described above happened only against the mocked
`fetch`, never against production. Worth a real click-through (set a real username through the
live UI, confirm it round-trips through a real `list` call) next time there's admin access.

### Real incident, same day: the new role selector caused a real self-lockout — fixed + hardened

The elegant-role-selector follow-up above worked exactly as built, which is precisely how the
incident happened: the real owner clicked their own account's new role control to try it out,
selected "Viewer," and it applied immediately — same one-click-applies behavior the old `<select>`
already had, just easier to trigger by accident with a bigger visible target. This instantly lost
owner access to `/admin/users` itself (owner-gated), with no other owner account to undo it and no
in-UI recovery path. Fixed immediately with a direct `supabase db query --linked` write
(`update profiles set role='owner' where email='jason.weismueller@gmail.com'`) restoring access,
confirmed via the same query's `select`.

**Per direct request, hardened so this specific failure mode can't recur, in both the Edge
Function (real enforcement) and the frontend (so it's never even offered, not just rejected after
the fact):**

- **`admin-users/index.ts`**: new `SOLE_OWNER_EMAIL` constant
  (`jason.weismueller@gmail.com`, hardcoded — this was an explicit "only I can be owner" request,
  not a general multi-owner design). `update` now rejects, before touching the database: any role
  change on your own account ("You can't change your own role"); granting `owner` to anyone other
  than `SOLE_OWNER_EMAIL` ("Only \<email\> can hold the owner role"); any role change at all on
  `SOLE_OWNER_EMAIL`'s account, even by a hypothetical different caller ("The owner role is
  permanently assigned to \<email\>"). Added the same shape of guard for `disabled` — you can't
  disable your own account, and `SOLE_OWNER_EMAIL` can't be disabled by anyone — since an accidental
  self-disable is the same class of lockout as the role one, just not the one that was actually hit
  this time. `create` rejects `role: "owner"` for any email other than `SOLE_OWNER_EMAIL` up front,
  before creating the Auth user. All of this sits *before* the password/username updates in the
  `update` handler, so a request mixing an allowed field with a disallowed one fails atomically —
  no partial password reset alongside a silently-dropped role change. Type-checked and redeployed.
- **`components-admin-users.jsx`**: mirrors the same `SOLE_OWNER_EMAIL` constant (frontend-only
  copy for UI purposes — the Edge Function above is the real enforcement, same "frontend gate is
  UX, not the boundary" posture used throughout this file). New `NON_OWNER_ROLE_OPTIONS` (Viewer/
  Editor only) is what the Add User modal always uses now — creating a new account can never be the
  one email that's allowed to be owner, so offering the option at all would only ever error. In the
  detail panel, the role `SegmentedControl` is greyed out entirely (not just missing the Owner
  option) whenever the selected user is yourself or `SOLE_OWNER_EMAIL`, with a `title` tooltip
  explaining which; the "Account enabled" `Toggle` and "Delete" button get the same treatment,
  each with its own explanatory hint/tooltip text instead of a generic disabled state.

**Verified**: `deno check` clean, redeployed (`dashboard_url` confirms a real deploy). Frontend
parses clean. Live-rendered via the same fetch-mock-plus-fake-session technique as the section
above: for the sole-owner account, the role control renders visibly greyed with all three pills
present (Owner still shown, just unreachable) and the correct tooltip, Delete is disabled, and the
enabled-toggle shows "You can't disable your own account"; for a different, non-owner account
(`researcher1`), the role control renders fully enabled with only Viewer/Editor offered (no Owner
segment at all) and Delete/enabled-toggle both active — confirming the restriction is scoped to
exactly the one account it should be, not applied blanket to everyone. **Not verified**: the
Edge Function's rejections themselves against a real request (would need a real owner JWT, same
standing limitation as elsewhere in this file) — only the SQL-level fix and the frontend UI states
were exercised directly; the reasoning in the deno-checked/deployed function code was not
exercised end-to-end with a real HTTP call.

### Admin polish batch: nav header, Posts toolbar, Feeds/Surveys nav visibility, Surveys heading, rename (2026-08-04)

Five small direct-feedback items plus one feature request, all in the admin shell/Feeds/Surveys —
none touch the backend.

- **Nav header now shows the username, not role.** `AdminShell`'s subtitle (and
  `AdminProjectPicker`'s) now reads `getAdminUsername() || getAdminEmail()`, dropping `· role: X`
  entirely. Needed real session plumbing, not just a display change: `getAdminUsername()` is new
  (`utils-backend.js`), backed by a new `ADMIN_USERNAME_KEY` localStorage slot threaded through
  `setAdminSession`/`clearAdminSession` the same way role/email already are.
  `fetchAdminProfile`/`supabaseAdminSignIn`/`supabaseAdminTouch` (`utils-backend-supabase.js`) now
  select and return `username` too. GAS login paths pass `username: ""` explicitly (not just
  omitted) so a stale Supabase-session username can't leak into a GAS session on the same browser.
- **Logout button**: moved onto the same row as "← Switch project / platform" (previously
  top-aligned against the title block instead, a few px off from that link), sized up 26→34px with
  a tinted danger-soft background instead of a bare icon.
- **Posts card toolbar**: refresh is now a plain muted "↻" glyph with no button chrome (was an
  equally-weighted icon button next to "+"), with a real gap (16px) separating it from "+", which
  keeps its bordered `IconButton` look as the actual primary action.
- **Feeds/Surveys nav rows**: inactive rows now get a real border + background
  (`var(--admin-surface-alt)`) instead of blending into transparent — the reported complaint was
  specifically that "Surveys" was easy to miss sitting right below "Delete feed" when Feeds was
  expanded. Nav gap bumped 2px→12px for the same reason.
- **Surveys heading now matches Feeds' pattern.** Two changes: removed the generic "Surveys /
  Create post-feed surveys..." `PageHeader` that always showed above `AdminSurveysPanel`
  (`components-admin-dashboard.jsx`) — Feeds has no equivalent outer heading — and changed the
  panel's own `<h3>` from a hardcoded literal "Survey Editor" to `survey.name || survey.survey_id`,
  mirroring Feeds' `selectedFeedName || selectedFeedId`. Caught and fixed a real bug from this
  during verification: a brand-new unsaved survey has both `name` and `survey_id` as empty strings
  (`handleCreateSurvey`'s `baseSurvey`), so the naive port rendered a blank heading — added a
  `|| "New survey"` fallback, confirmed via the same live-mocked verification technique used
  elsewhere in this file.
- **New feature, both Feeds and Surveys sidebar lists: double-click the *selected* row to rename
  it inline.** Local-only — `renameFeed`/`renameSurvey` just update the already-in-memory
  `feeds`/`survey` state exactly as the existing "Save feed"/"Save survey" flows already read from
  (`handleSaveFeed` already does `name: row?.name || feedId` off the `feeds` array;
  `survey.name` is the same field the Setup tab's own text field already writes to), so no new
  backend call was needed for either. Feeds' rename is gated `hasAdminRole("editor")` (mirrors
  "Save feed"'s own `RoleGate`); Surveys' is left ungated, matching this file's own pre-existing
  lack of role gates on Save/Delete survey — a real inconsistency between the two panels, not
  something introduced here, left as-is rather than silently "fixing" it as a drive-by.

**Verified**: all files parse clean. Live-rendered via the same fetch-mock-plus-fake-session
technique used throughout this file (fresh dev-server tab, fabricated `projects`/`feeds`/
`surveys`/`experiment_groups` responses): confirmed the nav subtitle reads "Signed in as jasonw"
with no role text; the logout button renders larger, tinted, and aligned with the back-link row;
the Posts toolbar shows a bare "↻" separated from a bordered "+"; the Surveys nav row renders
visibly bordered/backgrounded under an expanded Feeds section; creating a feed/survey and
double-clicking its selected sidebar row switched it into a live input, and committing a new name
updated both the sidebar row and the detail-pane heading in the same render (confirmed via
`get_page_text` and direct DOM inspection, not just visually). **Not verified**: an actual
mouse double-click by a real user (used a dispatched `dblclick` `MouseEvent` instead, same
class of gap as every click-simulation caveat already documented in this file) and the Setup
tab's "Survey name" field re-rendering with the new value specifically (confirmed indirectly via
the heading, which reads the same `survey.name`, but the field itself wasn't directly queried).

## "Default feed" concept removed entirely; feed-based launch links now 404 on a bad feed_id (2026-08-04)

Direct follow-up, same day, after the previous entry above walked back a partial removal out of
caution. The user confirmed explicitly: no participant should ever land on a feed-based launch
link without a real, matching `feed_id` — "if anything it should show Error 404 like the
studyfeed.org index" — closing the exact gap the previous entry's caution was about. Also asked
for Feeds to auto-select its first item the same way Surveys already silently did.

**Participant-facing (`App-{facebook,instagram,amazon}.jsx`, all three,
near-duplicate-footgun applies)**: `resolveChosenFeed` no longer calls
`getDefaultFeedFromBackend` or falls back to `feedsList[0]` — it now *only* matches the URL's
`feed_id` against real feeds, returning `null` for anything else (typo, deleted feed, stale
link). New `feedNotFound` state, set when `resolveChosenFeed` returns null for a (non-survey-only)
feed-based launch; the main render now short-circuits to a plain 404 block — literally the same
markup/copy as `index.html`'s own static bootstrap-script 404 (title "404", "This page could not
be found."), reproduced in JSX since that check runs before this app bundle even loads and has no
per-project feed data to check against. Replaces the whole app shell, not a dialog over it —
deliberately different from the pre-existing "Couldn't start the study" modal (still used for
genuine transient errors elsewhere in `startBoot`), since a bad feed_id isn't "something went
wrong," it's "this isn't a valid page." `document.title` also flips to "404 Not Found" to match.

**Admin dashboard**: `defaultFeedId` state, `getDefaultFeedFromBackend`/`setDefaultFeedOnBackend`,
the "Make default"/"Default feed" button, and every "default" badge (feed list rows, the detail
heading, `FeedParticipantsPage`'s subtitle) are all gone — not hidden, fully removed, along with
the now-fully-dead `supabaseGetDefaultFeedId`/`supabaseSetDefaultFeedId` (`utils-backend-supabase.js`)
and the GAS `DEFAULT_FEED_GET_URL`/`set_default_feed` action plumbing (`utils-backend.js`).
`loadFeeds()` now auto-selects the first feed in the list on load, mirroring
`AdminSurveysPanel`'s own `loadAll` (which already did this for Surveys, unchanged) — so Feeds and
Surveys now behave identically on arrival, per direct request, instead of Feeds requiring an
explicit click. `loadPostsFromBackend` (`utils-backend.js`) had its own internal
`getDefaultFeedFromBackend` fallback for a missing `feedId` argument — replaced with a plain
`return []`, since every real call site already always passes one and there's no "default" left
to fall back to.

**Verified against real production data (read-only, no writes, no participant data touched)**:
loaded `?project=project_1&feed_id=this_feed_does_not_exist_verify_404` — rendered the exact 404
block, `document.title` "404 Not Found," zero console errors; loaded the same project with a real
feed_id (`feed_1_rev`) immediately after — rendered the real Participant Information/consent
preface content for that live UWA-ethics-approved study exactly as before, confirming the change
doesn't affect a genuinely valid launch link. The admin-dashboard auto-select-first-feed change
itself was **not** verified live — hit a test-harness timing limit (the app's first data fetch on
mount fires before a post-navigation `javascript_tool` call can patch `window.fetch`, a genuinely
different problem from every other fetch-mock verification elsewhere in this file, which all
mock *before* triggering the fetch via a later user action, not before the initial mount's own
effect). Confidence is via code review instead: the new logic
(`const chosen = feedsList[0] || null`) is a mechanical simplification of the exact same
already-proven `chosen`-selection-and-post-loading code that was live before this change, just
without the removed default-lookup branch — worth a real click-through next time there's a way
to mock the initial-mount fetch, or admin access to confirm against real data.

## Session handoff (2026-08-04, end of session)

**Superseded by the later 2026-08-04 session below** ("Session handoff (2026-08-04, later
session)," at the very end of this file) — read that one first if picking up fresh; it supersedes
the "highest priority" item called out at the end of this section too (same item, still open,
carried forward rather than resolved). Left in place as history.

**Everything from this session is committed and pushed.** `git status` clean, `HEAD` ==
`origin/main` = `0f0afd7 remove default feed function`. This surprised the session itself partway
through — earlier turns assumed changes were sitting uncommitted in the working tree (the standing
caution in this file about no staging buffer), but the user's GitHub Desktop app had in fact been
auto-committing throughout, same mechanism documented in earlier sessions' "Deployment" notes, just
not actively watched for this time. **Lesson for next time**: run `git status`/`git log` to check
actual state rather than assuming based on what a given turn did or didn't call `git commit` on —
this repo's auto-commit can run without any tool call from Claude at all.

This session covered five separable pieces of work, in order: the Users & access page rework +
project access control + Feed Settings tab redesign; a username/role-selector polish pass; a real
self-inflicted lockout incident and its fix/hardening; a five-item nav/UX polish batch plus
double-click-to-rename; and full removal of the "default feed" concept, replaced with a 404 page
for feed-based launch links that don't match a real feed. **Full index, reading order, and the
consolidated list of what's genuinely unverified across all five pieces**:
`~/.claude/plans/patient-guarding-lovelace.md` — read that file's own "Status" section rather than
re-deriving this from five separate CLAUDE.md entries.

**The one item worth flagging above the others**: `project_access` RLS (per-user project
restriction) was written and applied to the live database, but never exercised against a real
restricted (non-owner) session — only verified by reading the policy SQL and by mocking the
frontend. Unlike everything else unverified this session, this one is a real security boundary,
so it's the highest-priority thing to close out next. **Still true as of the later session below —
this did not get picked up.**

## Admin dashboard professionalization: browser dialogs → Toast/Confirm/Prompt system (2026-08-04)

Prompted directly: "many of the responses are browser alerts, maybe those should be proper css
styled messages?" Escalated (with direct user agreement at each step) into a much larger
professionalization pass covering six areas total; this entry covers the first three, bundled
into one commit (`52704dd`) since they were built together in one continuous thread.

**Browser dialogs → themed equivalents.** `window.alert()`/`confirm()`/`prompt()` block the JS
thread, can't be styled, and read as dev-tooling rather than product — 90 call sites across 15
admin files (`components-admin-dashboard.jsx` 25, `components-admin-surveys.jsx` 26,
`components-admin-media-{facebook,instagram}.jsx` 9+8, `components-admin-editor-{facebook,
instagram}.jsx` 2+2, `components-admin-participants-{feed,survey}.jsx` 5+3,
`AdminProjectPicker.jsx` 5, `components-admin-users.jsx` 4, `components-admin-surveys-editor.jsx`
1, plus `utils-backend.js`'s `savePostsToBackend`). New shared primitives in `src/admin/ui/`:
- **`Toast.jsx`** (`ToastProvider`/`useToast()`) — stacked, auto-dismissing (4.5s success/info, 7s
  error) notifications replacing `alert()`. New `--admin-success-*` token group added to
  `tokens.css` (didn't exist before — only danger/accent existed).
- **`ConfirmDialog.jsx`** (`ConfirmProvider`/`useConfirm()`) — resolves to `true`/`false` like
  `window.confirm`, so call sites just need `await confirm(...)` instead of a bare call; a `danger`
  option renders the confirm button in the danger variant for destructive actions.
- **`PromptDialog.jsx`** (`PromptProvider`/`usePrompt()`) — resolves to the entered string or
  `null` on cancel, matching `window.prompt`'s contract.

All three render through `Modal.jsx` and are mounted once in `AdminEntry.jsx`, wrapping the whole
`/admin/*` route tree (so `AdminUsersPage`, which lives outside `AdminShell`, gets them too).
Module-level functions that aren't React components (`exportFeedAsPdf` in
`components-admin-dashboard.jsx`, `openPrintableSurveyDocument` in `components-admin-surveys.jsx`)
can't call hooks — given an `onError`/`onFallback` callback param instead, threaded from the
calling component's `toast.error`/`toast.info`.

**Loading-state audit.** Found the codebase already had good `busy`/disabled feedback almost
everywhere (Users page role/status/delete, survey save/delete/reset-balance, project
create/delete) — the two real gaps were **Delete Feed** and **Delete Survey**, which had zero
visual feedback during the async call. Added `deletingFeed`/`deletingSurvey` state, wired to the
`Button` component's `busy` prop (also upgraded a couple of existing `disabled`-only buttons to
`busy` for the spinner).

**Empty states.** New `src/admin/ui/EmptyState.jsx` — icon + title + message + optional action,
plus a `compact` text-only variant for the narrow Feeds/Surveys tree-sidebar lists. Replaced bare
grey one-line text ("No feeds yet.", "Select a survey.") across: Feeds list, Surveys list, Posts
list, Users list, Project picker (with a real "+ New project" action button), both "nothing
selected" main panels (Feeds/Surveys), survey responses list, feed participant submissions list.

**Unsaved-changes guard.** Post editor modal (`components-admin-dashboard.jsx`) and survey editor
(`components-admin-surveys.jsx`, `AdminSurveysPanel`) now track a dirty snapshot (`JSON.stringify`
comparison against a ref captured at open/load/save time) and confirm via `useConfirm()` before
discarding: closing the post-editor modal, switching to a different survey, creating/copying/
importing a new survey while one is open. Plus a `beforeunload` listener on both for tab close/
refresh. Deliberately scoped to just these two "real editor" surfaces, not the broader
"local `posts` array differs from last-published state" concept (a bigger, separate feature).

**Verified live**: dev server was already running (reused, not restarted). All testing used a
disposable fake admin session (`localStorage` `admin_token_v1` etc. — never real credentials) plus
a monkey-patched `window.fetch` mocking every backend call, so zero real writes touched production
data at any point. Confirmed via the real running app: `PromptDialog` renders themed and
auto-focused for "New feed"/"New project," `ConfirmDialog` renders with the danger-styled button
for "Delete feed"/"Delete project," and a forced-failure mock produced a visible, correctly-styled
error toast (confirmed via direct DOM query — a screenshot taken slightly later missed it, since
error toasts auto-dismiss after 7s and round-trip latency between tool calls eats into that).

## Error boundaries, modal accessibility, SVG icon set (2026-08-04)

Second round of the same professionalization thread, prompted by "what else." Bundled into commit
`e5fc462`.

**No error boundary anywhere.** A thrown error in one admin panel white-screened the *entire*
dashboard, nav included. New `src/admin/ui/ErrorBoundary.jsx` (class component — React has no
hook-based error boundary API), themed, with "Try again" (clears the caught error, re-renders the
same children — enough for transient issues) and "Reload page" (harder reset). Wrapped
individually around: each top-level `/admin/*` route in `AdminEntry.jsx` (Project picker, Platform
picker, Users, Dashboard), and — separately, inside `AdminDashboard` — the Feeds panel and the
Surveys panel each get their own boundary (keyed on `feedId` for the Feeds one), so a crash in one
doesn't take the other, or the shell/nav, down with it. This granularity is the actual point: a
single boundary around all of `AdminDashboard` would have unmounted the whole shell on any panel
crash, defeating the purpose.

**`Modal.jsx` gained focus trap + auto-focus + focus-return.** Tab/Shift+Tab now cycles within the
open dialog instead of escaping to the page behind it; focus lands on the first focusable element
(or respects a child's own `autoFocus`, e.g. `PromptDialog`'s input) on open; focus returns to
whatever triggered the dialog on close. `ConfirmDialog`/`PromptDialog` inherit all of this for
free since they render through `Modal`.

**A real bug was found and fixed while verifying this, not while writing it.** The initial-focus
effect had `useEffect(fn, [])` — fires once, tied to the component's true mount. But `Modal`
resolves its portal target asynchronously (`portalTarget` starts `null`, set via a separate
`useLayoutEffect`), so on the *first* commit the portal (and therefore `dialogRef.current`)
doesn't exist yet — the effect fired on that first commit, found `dialogRef.current` null, and
silently no-op'd forever (deps `[]` means it never runs again). Diagnosed by mounting a real
`Modal` instance via a dynamically-imported module in the browser console (same technique as
`patient-guarding-lovelace.md`'s manual verification work) and monkey-patching
`HTMLElement.prototype.focus` to log every call — zero calls logged from inside the dialog,
confirming the effect never actually focused anything. **Fix**: split into two effects — one for
capturing "what was focused before" + the focus-restore-on-unmount cleanup (still `[]` deps, this
part was never the problem), and a separate one for setting initial focus, keyed on `[portalTarget]`
so it re-fires once the portal actually attaches. Re-verified after the fix: focus correctly lands
on the dialog, Tab wraps forward from last→first element and Shift+Tab wraps backward from
first→last, and closing returns focus to the triggering element — all confirmed via the same
live-mounted-instance technique, not just code review.

**New `src/admin/ui/icons.jsx`** — a small stroke-based SVG icon set (24×24 viewBox,
`stroke="currentColor"`, `strokeWidth 1.8`, round caps/joins — same visual language as the
existing `RepostIcon` in `ui-posts-instagram.jsx`), replacing ad-hoc emoji in admin chrome:
platform picker (Facebook/Instagram/Amazon icons, now in tinted badge circles), Feeds/Surveys nav
icons, `EmptyState`'s default icon, `ErrorBoundary`'s warning icon. Deliberately **not** applied to
every emoji in the codebase — left alone: data-table boolean glyphs (✓/—, monochrome and
appropriate for a data grid), code comments, and the "🎲 Fill with random content" test-data
button (a niche dev/testing affordance, not structural chrome).

## Button consistency sweep, image compression, and two bugs found from real user reports (2026-08-04)

Third round, commit `a0fcb10`. The first two items are more of the same professionalization work;
the last two are real production bugs the user hit and reported *while this session was still
running*, found and fixed the same turn.

**Button sweep**: 14 raw `<button className="btn ...">` (old global-CSS-class buttons, not the
`Button` design-system component) converted to `Button` across `components-admin-dashboard.jsx`
(post-editor modal Cancel/Save, session-expiring/expired banners, feeds-error banner) and
`components-admin-participants-feed.jsx` (Refresh/Simulate/Clear/Download CSV/Details/Show more).
**Deliberately left alone**: `components-admin-login.jsx` (the whole sign-in page renders *outside*
any `.admin-shell` div — converting its buttons to `Button`, which depends on `--admin-*` CSS
variables scoped to `.admin-shell`, would have broken their styling entirely without also
restructuring the page; too high-stakes to risk on a consistency pass) and one
`<label className="btn ghost">` in `components-admin-feeds.jsx` wrapping a hidden file input
(`Button` renders a `<button>`, not a `<label>` — needed for real `<input type="file">` semantics).

**New `src/utils/utils-image-compress.js`** — `compressImageFile(file, preset)`, client-side
downscale + re-encode via `createImageBitmap` → `<canvas>` → `canvas.toBlob()`, run before every
image upload reaches `uploadFileToS3ViaSigner`. Two presets deliberately mirror the exact numbers
from the 2026-08-02 asset-maintenance pass (see that entry) rather than inventing new ones, so an
upload-time-compressed image and a `sips`-script-compressed image look the same: `feed` (1400px
long edge, quality 0.8) for post images/video posters, `avatar` (320px, quality 0.78) for avatars.
Never upscales; passes the original through unchanged (never throws) for GIFs (would destroy
animation), SVGs, decode failures, already-small-enough sources, or if the "compressed" result
somehow isn't actually smaller. Wired into all 7 image upload call sites (`components-admin-media-
{facebook,instagram}.jsx` image + poster uploads, `components-admin-editor-{facebook,
instagram}.jsx` avatar uploads); the 2 video upload call sites deliberately untouched. **Verified
live** with a synthetic 2800×1866 canvas-generated JPEG (avoids the source topic-pool image's CORS
restriction on cross-origin `fetch()`, which blocked the first verification attempt): `feed` preset
→ 1400×933, 73% smaller; `avatar` preset → 320×213, 97% smaller. Pass-through guards (GIF,
already-small image) also confirmed to return the exact original `File` object unchanged.

**Bug 1: SVG icons misaligned with adjacent text in the nav bar** (user-reported mid-session, from
directly looking at the shipped icons.jsx work above). Root cause: `<svg>` defaults to
`display: inline` with baseline alignment — unlike a text glyph, this reserves phantom space below
the shape for a font descender it doesn't have, which a parent `align-items: center` doesn't
correct for (it centers the *element*, whose own box already includes that phantom space). Fixed
at the source in `icons.jsx`'s shared `Base` component: `style={{ display: "block", flexShrink: 0,
...style }}` merged onto every icon (previously no `style` merging existed at all — a caller's
`style` prop would have fully overridden the defaults rather than combining with them, latent bug
fixed as part of the same change).

**Bug 2: `PromptDialog`/`ConfirmDialog`/`Toast` rendered completely unstyled — "floating" text with
no visible box** (user-reported: clicking "+" on Feeds to create a new feed). Root cause, confirmed
via direct DOM inspection (`document.querySelectorAll('.admin-shell')`, checking `.contains()`
against the provider's hidden anchor span) rather than guessed: `ToastProvider`/`ConfirmProvider`/
`PromptProvider` are mounted once in `AdminEntry.jsx`, **above** (outside) every individual page's
own `.admin-shell` div — `AdminProjectPicker`/`AdminPlatformPicker`/`AdminDashboard`/
`components-admin-users.jsx` each render their *own* separate `.admin-shell` wrapper, and none of
them is a common ancestor of the providers. So `anchorRef.current.closest(".admin-shell")`
correctly found nothing (the anchor span is a DOM *sibling* of wherever the current page's shell
div lives, not a descendant) and fell through to `document.body`, which has none of the
`--admin-*` CSS custom properties `Modal`'s styles depend on — every `var(--admin-*)` reference
silently resolved to nothing, producing unstyled markup. **Fix in `Modal.jsx`**: fall back to
`document.querySelector(".admin-shell")` (search the whole document, not just ancestors) before
finally falling back to `document.body` — safe because exactly one `.admin-shell` is ever mounted
at a time (the pages that render one are mutually exclusive routes; see the "watch for" note in
`~/.claude/plans/vigilant-mending-osprey.md` about this invariant). **A second, related bug found
in the same investigation**: `ToastProvider` is long-lived (mounted once, never unmounts across
navigation between admin pages), but its `portalTarget` was resolved *once* via
`useLayoutEffect(fn, [])` on its own mount — meaning after navigating to a different admin page
(each with a different, freshly-mounted `.admin-shell` div), the cached target would point at an
already-unmounted, detached DOM node, and toasts would silently stop appearing. Fixed by removing
the cached state entirely — `ToastProvider` now resolves `document.querySelector(".admin-shell") ||
document.body` fresh, inline at render time, only when `toasts.length > 0` (which is also the only
time it meaningfully re-renders, since nothing else about it changes across navigation). `Modal.jsx`
itself didn't have this second problem — each dialog is a fresh component instance created when
`state` goes non-null, not a long-lived wrapper, so its one-time-per-open resolution is correct as
long as it finds *something* valid to portal into, which the `document.querySelector` fallback now
guarantees. **Verified**: reproduced the exact real-world DOM shape (`.admin-shell` as a sibling,
not ancestor, of the mount point) via a live-mounted `Modal` instance in the browser console —
before the fix, computed style showed `background: rgba(0,0,0,0)`/`border-radius: 0px`/no shadow;
after, `background: rgb(255,255,255)`, `border-radius: 14px`, a real `box-shadow` — confirming the
fix against the actual failure mode, not just a plausible-looking DOM structure.

## Survey feed-link fixes: unsaved-feed guard + orphaned-feed cleanup (2026-08-04)

Fourth round, commit `f7de650` — a real production incident on a live study, reported by the user
*while this session was running*, diagnosed against the live database and fixed the same turn.

**The report**: clicking "Save Feed Setup" on **Study 3 - Main** (a real survey, `project_1`)
failed with a raw Postgres error surfaced verbatim: `insert or update on table "feed_surveys"
violates foreign key constraint "feed_surveys_feed_id_fkey"`.

**Diagnosis, via `supabase db query --linked` against the live database (read-only)**: the
survey's `linked_feed_ids` included `feed_14`, but `project_1::fb::feed_14` had no row in `feeds`
at all — every other id in the list (`feed_13`, `feed_3`, `feed_4`, `feed_5`) existed fine.
Root cause: creating a feed via "+ New feed" is pure client-state (`checksum: ""`, no
`updated_at`) until "Save feed" is actually clicked at least once — nothing in the survey editor's
Feed Setup picker distinguished a saved feed from an unsaved one, so nothing stopped the user from
linking one that had never been persisted. **A second, worse detail found in the same query**:
`feed_surveys` only had rows for `feed_3`/`feed_4`/`feed_5` — **not `feed_13`, despite `feed_13`
being a perfectly valid, already-saved feed**. Because `supabaseLinkSurveyToFeeds`
(`utils-backend-supabase.js`) inserts all new links in a single bulk `.insert()` call, and a
multi-row Postgres insert is atomic, `feed_14`'s FK violation rolled back the *entire* batch —
including `feed_13`, which had nothing wrong with it. This is why the fix needed to be
per-feed-id-precise, not just "block the specific bad one": any future attempt would need to
retry the *whole* batch cleanly once the blocking feed is resolved.

**Fix, pass 1** (still commit `a0fcb10`, before the second incident below): `handleSaveFeedLinks`
in `components-admin-surveys.jsx` now checks every selected feed's `updated_at` before calling the
backend at all — if any selected feed exists locally but was never saved, blocks with a clear
message naming it ("X hasn't been saved yet — open it in Feeds and click 'Save feed' first...")
instead of round-tripping to get a database error. Each such feed also gets a visible "Not saved
yet" badge directly in the picker. **Defense in depth**: `supabaseLinkSurveyToFeeds` also now
catches Postgres error code `23503` (foreign_key_violation) specifically and rethrows a friendly
message, in case this insert is ever reached by a path that skips the client-side check.

**Fix, pass 2** (commit `f7de650`, same day, later): the user then **deleted** `feed_14` entirely
(reasonable — it was never real) — but the survey's `linked_feed_ids` still referenced it, and
now there was **no way to remove it through the UI at all**: the picker only ever renders a
checkbox for each entry in the *current* `feeds` list, so a feed_id with zero matching feed object
has no row to uncheck. This is a genuinely different case from pass 1's "exists but unsaved" — the
`f && !f.updated_at` filter used there silently drops anything where `f` itself is `undefined`
(no match found), so orphaned references slipped straight through that check unnoticed. **Fix**:
new `orphanedFeedIds` computation (linked ids with *no* matching feed object at all, computed
separately from the unsaved-check) plus a dedicated red warning panel in the Feed Setup tab
listing each orphaned id (shown as the raw id, not a name — there's nothing to look up a name
from) with its own **Remove** button, calling the same `toggleFeed(fid)` the checkboxes use (which
doesn't care whether `f` exists, just whether the id is currently in `linked_feed_ids`). The
pre-save guard now checks orphans *first*, with its own distinct message, before the
unsaved-feed check.

**Verified against the live incident's own data** (read-only queries only, `feed_surveys`/`feeds`/
`surveys` all confirmed via `supabase db query --linked`, no writes made by Claude): confirmed
`feed_13`/`feed_3`/`feed_4`/`feed_5` all exist and have real `updated_at` values (so the guard
correctly lets them through), confirmed `feed_14` genuinely has zero rows in `feeds` (so
`orphanedFeedIds` correctly flags it, not the "unsaved" path), and confirmed `toggleFeed`'s
existing remove-when-present logic requires no changes to work for an orphaned id — it only ever
operates on the id string, never dereferences the feed object. Not verified: an actual click
through the real UI with a real admin session — same standing limitation as everywhere else in
this file (no login). The user was given the exact next step (open Feeds, save `feed_14` — wait,
correction, since it was deleted: remove it via the new panel, then retry Save Feed Setup) to
confirm live on their end.

## Test suite: started, then explicitly reverted (2026-08-04)

Part of the same "what else to improve" discussion — `vitest`, `jsdom`, `@testing-library/react`,
`@testing-library/jest-dom` were installed as devDependencies, no config or tests written yet, when
the user said "stop for now... test suite not needed for now." **Fully reverted**: `npm uninstall`
run for all four packages, then `git checkout -- package-lock.json` to clear residual transitive-
dependency version churn from the install/uninstall round-trip (a harmless but real diff —
`picomatch`/`tinyglobby` patch-version bumps, unrelated to the test packages themselves).
Confirmed via `git status`/`git diff` on `package.json`/`package-lock.json`: clean, no trace left.
**If this comes up again in a future session, it's not a new idea being proposed for the first
time** — check whether the user's answer has actually changed before re-pitching it.

## Session handoff (2026-08-04, later session) — read this first if picking up fresh

**Everything described in the four sections above is committed and pushed.** `git status` clean,
`HEAD` == `origin/main` = `f7de650 survey feed link issues fix`. Same auto-commit mechanism as
every other session in this file (the user's GitHub Desktop app) — confirmed by checking, not
assumed.

This session started from direct user feedback ("many of the responses are browser alerts") and
grew into a six-item "make the admin dashboard more professional" list through repeated "what else"
follow-ups, three of which shipped (browser-dialog replacement + loading/empty states + unsaved-
changes guards; error boundaries + modal accessibility + SVG icons; button consistency + image
compression) and three of which didn't (test suite — actively reverted; staging environment —
declined; Sentry — deferred pending the user creating an account). Along the way, the user reported
three real bugs live while the session was still running (SVG icon misalignment, unstyled/floating
dialogs, a `feed_surveys` foreign-key violation on a real study) — all found, root-caused against
real evidence (live DOM inspection, live database queries), and fixed the same session, including a
second pass on the FK issue once the user's own follow-up action (deleting the offending feed)
turned "never saved" into "no longer exists," a meaningfully different bug requiring a different fix.

**Full index, reading order, and the consolidated list of what's genuinely not done (not just
unverified)**: `~/.claude/plans/vigilant-mending-osprey.md` — read that file's "Status" and "What's
genuinely NOT done" sections rather than re-deriving this from four separate CLAUDE.md entries.

**The one item worth flagging above the others, again**: `project_access` RLS is *still* not
verified against a real restricted (non-owner) session — this was the top-priority open item at
the end of the *previous* session too (see the "Session handoff (2026-08-04, end of session)"
entry above this one) and did not get picked up this session either, despite the user's own "what
else" prompts surfacing it again mid-session. Two sessions in a row have now ended with this as
the highest-priority open item. If a third one does too, that's worth naming explicitly rather than
just re-adding it to another list.

## `project_access` RLS finally verified live; Sentry + `visible_if` editor shipped, undocumented (2026-08-05)

Picking this up fresh found three real pieces of work already committed to `main`
(`bc84bb7`, `4aea139`, plus `ff36b48`/`f32e4be` unrelated to this section) that were never
written up here — the CLAUDE.md update at `9e813f6` only covered the production-branch-gate work,
not these. Reconstructed from the migrations' own comments + git diffs, then independently
re-verified rather than taken on faith.

**`project_access` RLS gap — closed, and now actually verified against a real restricted session
(the item flagged as highest-priority across three straight session handoffs).** Two more
migrations landed after `20260801000016_project_access.sql` first shipped:
- `20260801000018_fix_projects_write_policy_select_leak.sql` — found and fixed a real bug:
  `projects_write_editors` was a single `for all` policy, and in Postgres a `for all` USING
  clause also governs SELECT; permissive policies for the same command OR together, so this was
  silently re-granting every editor/owner full unrestricted SELECT on `projects` regardless of
  `project_access`, completely undoing the restriction. Split into
  `projects_insert_editors`/`projects_update_editors`/`projects_delete_editors`, mirroring how
  `feeds`'s write policies were already split (which is why `feeds` never had this bug).
- `20260801000019_scope_content_tables_by_project_access.sql` — found a second, worse leak:
  `posts_select_public`/`surveys_select_public` were `to authenticated, anon using (true)` —
  *any* signed-in admin, restricted or not, had unrestricted read access to every post's full
  content and every survey's full `definition` across every project (worse than the
  ids/projects leak above — real content, not just names). `participants_select_admins`/
  `survey_responses_select_admins` were `authenticated`-only (no anon leak, correctly) but had no
  `project_access` scoping at all. Fixed: `posts`/`surveys` split into `_select_anon` (unchanged,
  participant-facing) + `_select_admins` (now `has_project_app_access`/`has_project_access`
  scoped); `participants`/`survey_responses` gained the same scoping on their existing
  authenticated-only policy.

**Verified for real this time** (previous two sessions only reviewed the SQL/mocked the
frontend). A disposable `editor`-role test account already existed from whatever session did this
work (`jason.weismueller+rlscheck@gmail.com` — a real Supabase Auth + `profiles` row, left in
place; flagging its existence here since nothing documented it and a future session could mistake
it for an unexplained account. Deliberately not deleted — it's a genuinely useful fixture for any
future project_access check and poses no elevated risk by itself, since `project_access` having
zero rows for it just means "same as before this feature existed," not de facto restricted).
Ran, inside a transaction that only committed a temporary `project_access` row (immediately
deleted after, confirmed 0 rows remaining): scoped that editor account to `project_1` only, then
— via `set local role authenticated; set local request.jwt.claims`, simulating its real session
end to end through Postgres, not a mock — confirmed `projects`/`feeds`/`posts`/`surveys`/
`participants`/`survey_responses` **all** returned rows for `project_1` only, nothing from any of
the other 6 real projects. This closes the item three straight session-handoff notes flagged as
"the highest-priority thing to close out" — it's done and genuinely confirmed now, not just
written and hoped-for.

**Sentry error monitoring shipped** (`src/utils/utils-sentry.js`, called from `initSentry()` in
all three `main-*.jsx` entry points before first render). Deliberately minimal: `tracesSampleRate:
0` (error tracking only, no perf tracing/session replay — real bundle weight, not asked for) and
`sendDefaultPii: false` made explicit rather than left to the SDK default, specifically because
this is a human-subjects research tool and a crash report should never bundle more than the error
itself. `VITE_SENTRY_DSN` is set in the committed `.env.production` (a DSN, not a secret — same
"safe to expose client-side" reasoning as the Supabase anon key already committed there) — so this
is live in production already, not just scaffolded.

**`visible_if` conditional-question-display editor UI shipped** — the exact feature
`~/.claude/plans/peaceful-jumping-haven.md` scoped (that plan predates this entry; treat it as
superseded/completed history, not a pending task). New `ConditionalDisplayEditor` in
`components-admin-surveys-editor.jsx`, `VISIBLE_IF_ELIGIBLE_TYPES` in `utils-survey.js`, orphan
cleanup on question delete, and a broken-condition warning badge (mirroring the existing
duplicate-id badge pattern) — all confirmed present and wired via direct grep (not just trusting
the commit happened), and all touched files parse clean. Not click-tested live (same standing
no-admin-login limitation as everywhere else in this file).

**Lesson for future sessions, stated plainly**: a "Update CLAUDE.md" commit message doesn't
guarantee the file was updated to cover *everything* since the last one — this specific gap
existed because `9e813f6` bundled a `CLAUDE.md` update with unrelated work (the production-branch
gate) and simply didn't reach back to the two commits before it. When picking up a session, diff
`git log` against what CLAUDE.md actually narrates rather than assuming the two are in sync just
because a recent "Update CLAUDE.md" commit exists.

## Amazon: "Randomize names"/"Randomize times" were silent no-ops, fixed; irrelevant toggles hidden (2026-08-05)

Investigated per direct request ("the amazon changes you talked about — no randomization, etc.").
No record of a prior specific plan for this was found anywhere (git history, `~/.claude/plans/`,
memory) — so this is a from-scratch investigation and fix, not a resumed plan; noting that plainly
since the phrasing implied one existed.

**Root cause, confirmed by reading the code, not guessed**: `App-amazon.jsx` already fetches all 5
feed randomize flags (`fetchFeedFlags`) and already passes `flags`/`runSeed`/`app` down to its
`<Feed>` (`FBFeed`) call site — but `Feed`/`PostCard`/`ReviewCard` in `ui-posts-amazon.jsx` never
declared those props in their signatures at all, so React silently dropped them and every review's
`author`/`date` always rendered the raw stored field, completely ignoring the flags. The admin
"Randomize names"/"Randomize times" toggles on an Amazon feed were real, saved to the backend, and
visibly flipped in the UI — just had zero effect on what participants actually saw. (Avatar/Image/
Bio toggles were already known no-ops for Amazon per this file's Architecture section — no photo
avatars, `data-has-image="0"` hardcoded with no image rendering anywhere, and no bio-hover UI at
all — those three were always cosmetic dead switches, not a regression.)

**Fix**:
- `src/ui-posts/names.jsx` — new `AMAZON_REVIEWER_NAMES` pool (~50 entries), "First Last-initial."
  style matching real Amazon's reviewer-name convention — a deliberately different shape from
  FB/IG's full-name pools (`FB_FEMALE_NAMES` etc.), not a reuse of them.
- `src/utils/utils-core.js` — new `displayReviewDateForAmazon(review, {randomize, seedParts})`,
  parallel to the existing `displayTimeForPost` but producing Amazon's absolute
  `"Reviewed in the United States on <Month D, YYYY>"` format instead of FB's relative `"2h"` —
  the two formats don't overlap, so this needed its own helper rather than extending the existing
  one. Deterministic per review id + seed, picked from a **fixed 2025-06-01 anchor** (not
  `Date.now()`) going back up to ~2 years, specifically so the date a participant sees for a given
  review doesn't drift if their session or the study's data-collection window straddles a real
  calendar date change.
- `src/ui-posts/ui-posts-amazon.jsx` — `Feed` now builds a deterministic reviewer-name assignment
  map via the same `buildDeterministicAssignmentMap` helper FB/IG already use for author names
  (seeded on run+app+project+feed+review-id, stable across re-renders, varies across different
  runs/participants — confirmed live, see below), and threads `flags`/`runSeed`/`app`/
  `assignedReviewer` through `PostCard`/`ReviewCard`. `ReviewCard` now reads
  `flags.randomize_names`/`flags.randomize_times` (same field names FB/IG already use) and swaps
  in the assigned name / randomized date only when each flag is actually on — flags off (the
  default, and every feed's state before this fix) renders byte-identical to before, so this is
  additive, not a behavior change for existing non-randomized Amazon feeds. Removed the now-dead
  `getReviewDate` helper (its one call site was replaced; `displayReviewDateForAmazon`'s
  non-randomize branch already reproduces its exact fallback chain).
  Survey post-reminder call sites deliberately don't pass `flags`/`runSeed`/`assignedReviewer` (same
  as before this fix) — reminders show the post's real frozen stored reviewer/date, not a randomized
  live-feed pick, matching how reminders already behave for FB/IG.
- `src/admin/components-admin-feeds.jsx` — the Feed Settings "Behavior" card now hides
  Avatar/Image/Bio toggles specifically when `APP === "amz"` (Time/Name stay, since those now
  genuinely work) — so an admin editing an Amazon feed no longer sees three switches that visibly
  do nothing.

**Verified live**, not just unit-tested: mounted the real `Feed` export (dynamic-imported from the
running dev server, same technique used throughout this file — `ReactDOMClient.createRoot`, not a
mock) with 4 fabricated reviews. With `flags: {randomize_names:false, randomize_times:false}`,
rendered reviewer names/dates were the raw stored values unchanged (`RAW_AUTHOR_1`.., literal
January 1-4 2025 dates) — confirming zero behavior change for feeds with randomization off. With
both flags `true`, rendered names came from `AMAZON_REVIEWER_NAMES` (e.g. "Melissa V.", "Jacob J.")
and dates were distinct plausible values spread across 2023-2025, all four reviews different from
each other and from the raw stored dates. Also directly confirmed via console: the same review id +
seed always produces the same assigned name/date (`stableAcrossRerender: true`), and a different
`runSeed` produces a different assignment (`differsAcrossRun: true`) — matching the exact
determinism contract FB/IG's own name/time randomization already relies on. All touched files
parse clean. **Not verified**: an actual admin click-through toggling the flags in the real UI
(same standing no-login limitation as everywhere else in this file) — the Feeds Behavior card's
Amazon-specific toggle filtering was confirmed correct by direct code/parse review only, not
rendered live.

**Known, larger, deliberately out-of-scope gap found along the way**: Amazon reviews configured
with an image via the admin's `MediaFieldset` never render that image to participants at all —
`ReviewCard` hardcodes `data-has-image="0"` and has no `<img>` anywhere in its markup. This is a
separate, much bigger feature (building actual review-image display) than "wire up the randomize
toggles that already exist," so it wasn't attempted here — flagging it explicitly rather than
scope-creeping into it silently.

## New: data-quality flags + a "Go live" auto-refresh mode (2026-08-05)

Per direct request to add "suspicious participants" and "live dashboard" functionality that had
apparently been discussed — **neither was found anywhere** (git history, `~/.claude/plans/`,
memory, code) when picked up fresh, so both were built from scratch against a reasonable reading
of the phrase rather than a resumed spec. Flagging that plainly rather than pretending otherwise;
if the original intent was different, this is a starting point to adjust, not a completed spec.

**Data-quality flags — transparent, conservative, never auto-excludes anything.** Two independent
pieces, both purely client-side over data already loaded (no new backend calls, no new stored
fields):
- **Feed Participants** (`components-admin-participants-feed.jsx`) — new "Flags" column on the
  "Latest submissions" table. Two heuristics: **Very fast** (`ms_enter_to_submit` under a hard
  4s floor, or under 25% of this feed's own median completion time — whichever catches it; the
  relative check adapts to feeds of very different lengths, the floor catches short feeds where
  the relative threshold alone would be too lenient) and **Repeat ID** (the same non-blank
  `participant_id` appears more than once for this feed — usually a re-entry/re-submission, not
  two different people). Each badge has a hover tooltip explaining exactly why it fired.
- **Survey Participants** (`components-admin-participants-survey.jsx`) — new "Flags" column on the
  Responses table: **Straight-lining**, computed via new `computeStraightLineFlags(dataset, row)`
  — for every auto-detected composite scale with ≥3 items, checks whether a response gave the
  *exact same* value to every item. Incomplete composites (any item left blank) are skipped
  rather than flagged, since a blank isn't "the same answer" — avoids a false-positive class that
  would otherwise dominate early low-N data.

Both are deliberately named "flags," not "suspicious"/"fraud"/"exclude" — this is real participant
data from paid studies, and a false positive read as an accusation is a worse failure mode than a
missed one. Thresholds are loose on purpose (biased toward under-flagging); no row is hidden,
disabled, or excluded from any export — this is a hint for the researcher to look closer, full
stop.

**"Go live" auto-refresh** (`components-admin-participants-feed.jsx`, Feed Participants toolbar) —
a toggle next to the existing "Refresh" button. Off by default (no surprise background network
traffic on a page just sitting open in a background tab). When on: silently re-polls the roster
every 20s, shows "Updated Xs ago"/"Updated Xm ago" next to the button, and disables itself while
viewing simulated data (nothing live to poll for there). This was scoped as an extension of the
existing single-feed Feed Participants page rather than a new standalone multi-feed monitoring
page/nav item — a full cross-project "live dashboard" would be a much larger, riskier addition
(new route, new nav entry, likely new aggregate backend queries) to build unprompted from a
half-remembered request; if a dedicated always-on multi-feed monitoring view turns out to be what
was actually wanted, that's a clear, well-scoped follow-up rather than something to have guessed
at building tonight.

**Verified live**, not just read for correctness:
- Straight-lining: called `buildAnalysisDataset` (the real function) against a fabricated 3-item
  matrix question and three response rows (straight-lined / normal / incomplete) via a cache-busted
  console import of the running dev server's own module — confirmed the straight-lined row alone
  produced a flag, matching the production logic exactly (same dataset shape, same
  `getRawItemValue` call).
- "Go live": mounted the real `FeedParticipantsPage` (via `ReactDOMClient.createRoot`, wrapped in
  the real `ToastProvider`/`ConfirmProvider`, inside a `.admin-shell` node for correct CSS token
  scope — same technique this file already documents using elsewhere) with a faked admin session
  and a mocked `fetch` returning an empty roster (no real backend/data touched). Confirmed: the
  "Go live" button renders, clicking it flips the label to "● Live", the "Updated Xs ago" status
  text appears and reads "Updated 0s ago" immediately after the triggered refresh, and the 20-second
  polling interval is genuinely registered (spied on `window.setInterval`, confirmed a real call
  with `20000`ms) — not just a UI label with no actual polling behind it.
- Feed Participants' "Very fast"/"Repeat ID" flags were verified by direct code review of the
  (simple, easily-traced) threshold logic rather than a live render — lower risk than the
  straight-lining/composite logic above, which had more moving parts worth actually exercising.

**Not verified**: an actual click-through by a real logged-in admin against real accumulating
participant data (same standing no-login limitation as everywhere else in this file) — worth
watching a real study collect a few responses with "Go live" on, and checking whether the flag
thresholds feel right (too noisy / not noisy enough) against real response patterns, next time
there's admin access.

## RLS audit continued: experiment_groups/feed_surveys/custom_measure_groups/experiment_assignments were still leaking across projects (2026-08-05)

Direct continuation of tonight's earlier RLS work (see "`project_access` RLS finally verified
live" above) — re-audited every table's `pg_policies` from scratch instead of assuming the two
migrations already applied covered everything. They didn't: four tables added later
(`20260801000015`, after `project_access` itself in `20260801000016`) never got the same
treatment and had the identical bug classes already fixed elsewhere:

- **`experiment_groups_select_public`** and **`feed_surveys_select_public`** were both
  `to authenticated, anon using (true)` — the exact same shape `20260801000019` fixed for
  posts/surveys. Any signed-in admin, restricted or not, could read every project's experiment-group
  definitions and feed↔survey links across every project, not just their own. (The `anon` half is
  legitimate and untouched — real participants need it: `supabaseLoadSurveyDefinition` merges
  `experiment_groups` onto the survey object on load, and `feed_surveys` is how a feed resolves its
  linked survey.)
- **`custom_measure_groups_select_admins`** and **`experiment_assignments_select_admins`** were
  already correctly `authenticated`-only (no anon leak) but had no `project_access` scoping at all —
  same gap `20260801000019` closed for `participants`/`survey_responses`.

**New migration `20260801000020_scope_experiment_and_custom_group_tables_by_project_access.sql`**,
applied live. None of these four tables carry their own `project_id` column (all key off
`survey_id`), so each admin-facing policy scopes via `exists (select 1 from surveys s where
s.id = X.survey_id and has_project_access(s.project_id))` rather than a direct column check.

**Verified against a real restricted session**, same technique as the earlier RLS entry (temporary
`project_access` row on the disposable `+rlscheck` editor account, scoped to `project_1` only,
`set local role authenticated` + `request.jwt.claims`, cleaned up after — 0 rows left in
`project_access` when done): confirmed `experiment_groups`/`feed_surveys` visible to that session
only ever belonged to `project_1` (18 and 28 rows respectively, both scoped correctly), and
`experiment_assignments` returned 42 rows, also all `project_1`-scoped by construction (the query
joins through `surveys.project_id`, so an unscoped leak would have shown other projects' rows in the
same result). `custom_measure_groups` returned 0 — double-checked as owner that the real total across
the *entire* database is genuinely 0 (nobody has saved one yet, a newer feature — see "Survey
Participants analysis hub" custom-groups entry — not a false-negative from an overly strict policy).

This should be the last table-level gap in this specific audit — every table this session checked
(`projects`/`feeds`/`posts`/`surveys`/`participants`/`survey_responses` from the earlier entry, plus
these four) now scopes admin reads through `project_access` where relevant, with participant-facing
`anon` access left untouched everywhere it was already correct. Worth a full fresh
`select tablename, policyname, cmd, roles, qual from pg_policies` sweep in a future session before
assuming that's still true, the same way this entry itself only found these four by not assuming.

## Staging gets its own Supabase project — `studyfeed-staging` (2026-08-05)

Per direct user decision (offered the tradeoff explicitly: share production's Supabase project
vs. a separate one; user chose separate, matching the "recommended" note this file already had on
this exact question) — created a brand-new, empty Supabase project for the Netlify staging site to
use, rather than pointing staging at production's real database.

- **New project**: name `studyfeed-staging`, ref `hgctbgunlsesygzglbdv`, same org
  (`paqkfpzvklettmoppoaw`) and region (`us-west-1`) as production. Created via
  `supabase projects create` (CLI already authenticated in this sandbox — no dashboard step
  needed). A fresh, randomly-generated database password was set at creation time and given to the
  user once in chat to save themselves; not recorded anywhere in this repo.
- **All 20 migrations from `supabase/migrations/` applied in order** (`supabase link
  --project-ref hgctbgunlsesygzglbdv` then `supabase db query --linked -f <file>` per file, same
  process this repo always uses — not `db push`) — zero errors. Verified after: all 13 expected
  tables present (`select table_name from information_schema.tables`), and the database is
  genuinely empty (0 rows in `projects`/`feeds`/`posts`/`profiles`) — this is a schema-only clone,
  no production data was copied.
- **CLI relinked back to production (`yrzqnlhbawzuzlrrocfd`) afterward**, confirmed via a
  real-data sanity query (`select count(*) from projects` → 7, matching production's known project
  count) — so a future session's `supabase db query --linked` defaults to production again, not
  staging. **If a future session needs to touch the staging project specifically, it must
  `supabase link --project-ref hgctbgunlsesygzglbdv` first and relink back to
  `yrzqnlhbawzuzlrrocfd` when done, same as this one did** — there is no persistent "which project
  is staging" state anywhere else.
- **API keys** (anon/publishable — safe to expose client-side, same reasoning as production's
  already-committed key; service_role was fetched too but deliberately not used or recorded
  anywhere, same as production's own service_role) fetched via
  `supabase projects api-keys --project-ref hgctbgunlsesygzglbdv` and handed to the user directly
  to paste into the Netlify site's environment variables (`VITE_SUPABASE_URL`/
  `VITE_SUPABASE_ANON_KEY`, matching the `sb_publishable_...` key format `.env.production` already
  uses, not the legacy JWT-style anon key that project also issued) — not written into this repo's
  `.env.production`, since that file is production's, not staging's; the Netlify site's own
  dashboard is the only place staging's env vars live.
- **`VITE_BACKEND=supabase` also needs to be set** on the Netlify site alongside the two Supabase
  vars — without it, the build defaults to `gas` regardless of the other two being present (same
  "unset env var disables the feature" convention noted elsewhere in this file).

**Not done / worth knowing**: no data was seeded into the staging project — every table starts
empty, so a fresh admin login there will show zero projects/feeds until someone creates test data
directly against it. That's intentional (real isolation was the whole point), not an oversight.
