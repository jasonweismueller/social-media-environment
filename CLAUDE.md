# social-media-environment (aka "fakebook")

A research tool for running social-media-exposure studies. Participants are shown a simulated
Facebook, Instagram, or Amazon-reviews feed and/or a survey; researchers configure everything
(posts, feeds, surveys, experiment conditions) through an admin UI.

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
  cells) even if the tab only ever holds a one-cell JSON blob. `ensureSheet_` now trims a
  freshly-created sheet down immediately; if this limit gets hit again, the fix is a one-time
  `trimAllSheetsToContentSize_()` sweep (see git history / conversation for the exact function)
  run manually from the Apps Script editor.
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
Script directly either time). **Unverified whether either has been pasted + redeployed.** If
experiment groups (block or question visibility, or the reset-balance button) don't seem to work
in a future session, check Code.gs deployment status first before debugging frontend code — this
has been the actual root cause multiple times.

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

## Build/dev notes

- `npm run dev` — Vite dev server. **Currently hangs indefinitely at startup in this
  environment** (confirmed by running it directly, with a cleared `node_modules/.vite` cache,
  and via the browser-preview tooling — all hang the same way, never printing the "Local:
  http://..." banner). Same underlying class of issue as the `npm run build` problem below
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
