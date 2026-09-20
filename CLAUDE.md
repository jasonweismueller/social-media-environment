# social-media-environment (aka "fakebook")

A research tool for running social-media-exposure studies. Participants are shown a simulated
Facebook, Instagram, or Amazon-reviews feed and/or a survey; researchers configure everything
(posts, feeds, surveys, experiment conditions) through an admin UI.

## Standing verification posture — read once, applies everywhere below

Real admin credentials are never entered (login is off-limits on principle), so almost nothing in
this file's "Verified" notes means "a logged-in human clicked through the real UI." In practice
"verified" means one or more of: mounting the real bundled React components directly via
cache-busted dynamic imports against the running dev server with fabricated data; loading a real
page and mocking only the specific network response under test; reading/writing disposable rows
directly against the real Supabase project via `supabase db query --linked`, then cleaning up. All
three are meaningfully stronger than code review alone (they've caught real bugs code review
missed), but none is a real click-through. Individual entries only call this out with extra detail
when the specific verification technique or its gaps are unusual — a bare "not verified live" or
"same standing limitation" elsewhere in this file just means this paragraph applies as-is.
`staging.studyfeed.org` (real content, no participant-data risk, real owner login) is the one place
a genuine click-through has been possible since 2026-08-05 — worth using it before trusting anything
below beyond what's stated as tested.

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

Same footgun bit `ThankYouOverlay` (fixed 2026-08-01, see "Survey submission bugs found and fixed"
in `CLAUDE-ARCHIVE.md`): the
component is defined separately in `ui-core-facebook.jsx`/`-instagram.jsx`/`-amazon.jsx`, and
the `App-*.jsx` call sites were updated to pass new props (`title`/`messageHtml`/
`completionCode`/`hideSessionId`) that only got wired up in the component definition itself
for... none of the three, at first. Any time a prop gets added to a call site of a
per-app-duplicated component, grep for every definition of that component before assuming it's
handled.

## 2026-08-01 through 2026-08-17: moved to CLAUDE-ARCHIVE.md

~6,500 lines / 105 session-log entries from this project's first 2.5 weeks were relocated here
verbatim on 2026-09-19, purely to shrink what's auto-loaded into every session's context — nothing
was deleted or rewritten. Covers everything from the earliest feature builds (experiment groups,
the first admin-dashboard redesign, the Projects→Platform→Dashboard nav flow — all superseded by
later rounds still below in this file) through the Apps-Script-to-Supabase backend migration
(planning through production cutover and its post-cutover incidents), `project_access`/RLS
build-out, the original survey-editor redesign + preview feature, the first four rounds of realism
features (engagement counts/pacing/surroundings) and their bugs, the first two rounds of dark mode,
the survey response simulator, submission abuse guards, attention-check questions, and roughly two
dozen more self-contained bugfixes. **Open `CLAUDE-ARCHIVE.md`** when a current symptom looks like
something from this period, or when a note below references "the migration" or an early redesign
round and you want the original full reasoning rather than the summary. Its own table of contents
lists every entry by title and date.

**One convention from this period is still a standing, active design constraint — worth keeping
here rather than only in the archive**: `feeds.id`/`posts.id` are **composite** keys, not bare
ids — `<project_id>::<app>::<feed_id>` for feeds, `<feed_id>::<post_id>` for posts (with the plain
original id preserved separately as `feed_id`/`post_id`). Real GAS-generated ids are only unique
*within* whatever scope they were created in — a feed duplicated into Control/Treatment/PL/PS
variants (a common study-design pattern in this app) shares the same bare post id across every
variant. Any code that maps a post or feed in either direction (read *or* write) must
compose/decompose through this convention, or it will silently steal/misattribute rows the moment
two variants share a bare id — this exact bug has hit production for real more than once (see the
archive's "Backend migration" and "Real content added to a live survey" entries for the full
incident histories).

## Survey editor tabs: reorganized (Description relocated, Completion moved into "Participant flow"), plus a new "Preview" that now actually shows the preface (2026-08-21)

Prompted directly, in response to open questions about the Surveys admin panel's 5 tabs (Setup/
Pre-feed/Questions/Participants/Launch & completion, `components-admin-surveys.jsx`) — the
Description field was called out specifically as barely-used clutter, plus general "should we
rearrange/compact/add anything" questions.

**Investigated before changing anything**: `survey.description` isn't dead — it's the one real
consumer, `buildSurveyEthicsHtmlDocument`'s ethics-protocol export (`<p>${description}</p>` at the
top of the generated Word/PDF document). Its problem wasn't that it's unused, it's that it sat at
the very top of the Setup tab (the first thing every admin sees) for a field whose only actual
payoff is a document most admins open rarely — pure prominence-vs-value mismatch, not deadness.

**Changes, all in `components-admin-surveys.jsx` unless noted**:
- **Description relocated**, not deleted — moved out of Setup's "Survey details" card into the
  Launch tab's "Launch links and IDs" card, positioned directly above "Ethics protocol export" (its
  actual and only consumer), with a hint explicitly naming that connection. Collapsed behind a
  "+ Add a study description" disclosure link when empty (`descriptionForceOpen` state, reset on
  survey switch via the existing survey-select effect) — expands automatically if the survey
  already has one, so nothing existing is hidden.
- **Setup tab compacted**: "Study flow" (select) and "Participant appearance" (dark-mode toggle) —
  both short, single-control fields previously stacked full-width — now sit side by side in a
  2-column grid. Verified via `getBoundingClientRect()` on a live-mounted copy of the exact grid
  CSS: both fields share the same `top`, different `left` — genuinely side-by-side, not stacked.
- **Tabs rearranged around a "before / after" framing**: "Pre-feed" renamed **"Participant flow"**
  and split into two cards — "Before the study" (unchanged: participant info/consent/instructions)
  and a new **"After the study"** card, which is the "Completion / thank you" card **moved
  wholesale** from the Launch tab (same gating condition, same fields, just re-labeled and
  relocated) — so every piece of participant-facing copy (what they read before, and what they see
  after submitting) now lives in one tab, instead of split across two unrelated ones. Launch tab
  renamed **"Launch & data"** (was "Launch & completion" — no longer accurate once Completion
  moved out) and is now purely operational: IDs/links, the (relocated) description + ethics export,
  CSV downloads, delete-data, experiment group balance.
- **New: a "Preview" button reachable from every tab** (not just Questions), added to the survey
  header row next to the name. Reuses the existing `SurveyPreviewModal` — the same data
  (`linkedFeedsForEditor`/`linkedFeedPostsMap`/`selectedFeedIds`) and a locally-computed
  `experimentGroupsForPreview` (`normalizeSurveyExperimentGroups(survey)`, already exported from
  `components-admin-surveys-editor.jsx`) were already in scope at this level, so this needed no new
  data plumbing.
- **Real gap found and fixed while building the above, not assumed away**: `SurveyPreviewModal`
  (`components-admin-survey-preview.jsx`) never actually rendered the preface at all — it always
  jumped straight to `SurveyScreen`'s question pages, `materializePagesFromBlocks`-only, with zero
  reference anywhere to `SurveyPrefaceFlow` or the participant-information/consent/instructions
  fields. This was caught by live-mounting the real modal with fabricated preface content and
  finding the rendered text never included it — not by reading the code and assuming it worked.
  Fixed by importing the already-shared, fully self-contained `SurveyPrefaceFlow` (`../ui-core`,
  `{survey, participantDisplayId, onComplete}` — the exact same component real participant delivery
  uses) and rendering it first whenever the survey actually has preface content (`participant_
  information_html`/`consent_text_html`/`instructions_html` non-empty), advancing to the normal
  question view via its `onComplete` callback. A per-question "Preview this question" jump
  (`initialQuestionId` set, the existing Questions-tab entry point) now starts with preface already
  marked done, so it still lands directly on the target question as before — didn't change that
  entry point's behavior, only the plain "Preview" entry point's.

**Verified live**, via the dev server (confirmed working in this environment) and cache-busted
dynamic-import component mounts (no admin login available — standing limitation throughout this
file): the 2-column grid renders genuinely side-by-side; the description disclosure link correctly
reveals/hides the textarea; the full preface flow was clicked through end-to-end with fabricated
marker content — Participant Information → Consent (including the "No" branch correctly showing the
real decline overlay) → Instructions (confirming the final step's button correctly reads the
survey's own custom `pre_feed_button_label`) → then, and only then, the actual question — with zero
console errors at any step; confirmed `initialQuestionId` still correctly skips straight to the
target question with no preface shown. All three touched files parse clean (`@babel/parser`).
**Not verified**: an actual click-through by a real logged-in admin — same standing limitation as
everywhere else in this file. Worth a real look on `staging.studyfeed.org` before assuming this is
pixel/behavior-perfect beyond what live component-mount verification already covered.

## UI/UX modernization, phase 1: design-token overhaul + shared primitives + entry screens/nav chrome (2026-08-21)

Direct request for "the kind of changes that really make a difference... state of the art... in
terms of functionality but also UX and UI" — user picked **UI/UX modernization** specifically
(offered alongside AI-assisted authoring, new platform surfaces, and deeper behavioral
instrumentation, all deferred). Scoped as a genuine foundation pass rather than a per-screen
reskin: every admin screen is built from `src/admin/ui/`'s shared primitives (`Button`/`Card`/
`Table`/`Tabs`/`Toggle`/`Modal`/`Popover`/`Badge`/`EmptyState`/`PageHeader`), so upgrading those
plus the design tokens they read from cascades everywhere automatically — this is phase 1 of that
foundation, not a claim that every individual dashboard screen has now had its own dedicated pass.

**Investigated before writing any CSS**, via live screenshots of the real login/project-picker
pages and direct code reading of every `src/admin/ui/*.jsx` file, rather than guessing:
- **Buttons had zero hover/press feedback anywhere** — `Button.jsx`'s only `transition` covered
  `background`/`border-color`, but nothing ever changed those properties on hover (no `:hover`
  rule exists for inline styles), so every button in the admin tool was, in practice, static until
  clicked. Same gap in `IconPillButton`/`ThemeToggle`/`LogoutButton`/nav rows/tabs — all raw
  `<button>`s styled purely inline.
- **Table rows had no hover state**, `Modal`/`Popover` had no entrance animation (appeared
  instantly), `Card`'s shadow was a single flat `0 1px 2px` blur with no real depth.
- **The admin UI's own typography was never actually owned** — `.admin-shell` declared no
  `font-family` at all; the whole admin tool's body font was an accidental side effect of
  whichever participant-facing platform stylesheet (`styles-{facebook,instagram,amazon}.css`)
  happened to already be loaded on the page, all three of which happen to declare an identical
  stack today, purely by coincidence, not by design.

**`src/admin/ui/tokens.css`** — the foundational layer, additive (no existing `--admin-*` token
renamed, so no call site needed to change to benefit):
- `.admin-shell` now declares its own `font-family` explicitly (a refined system-font stack,
  `-webkit-font-smoothing: antialiased`, `letter-spacing: -0.01em`) instead of inheriting one by
  coincidence.
- New named type scale (`--admin-text-2xs` through `-3xl`), motion tokens (`--admin-ease`, three
  duration tiers), and a deeper neutral/shadow system — `--admin-shadow-sm`/`-md` (already used
  throughout the app) upgraded in place from flat single-blur shadows to layered ambient+key-light
  shadows, so every existing card/dropdown/modal gets more realistic depth with zero call-site
  changes; new `-xs`/`-lg`/`-hover` tiers added for finer control. Accent color deepened slightly
  (`#4f46e5` → `#4338ca`) for more contrast/a less default-Tailwind feel.
- **New shared interaction classes** — `.admin-btn` (hover: `filter: brightness()` + shadow bump;
  active: scale-down; `:focus-visible`: accent ring — deliberately filter/transform/shadow-based,
  not a `background` override, so it layers correctly on top of *any* inline background a variant
  sets, one class for every button variant), `.admin-card-interactive` (hover-lift for whole
  clickable cards), `.admin-row-hover` (background-only, for table/nav rows where a lift would be
  too much motion). Plus `admin-fade-in`/`admin-modal-in`/`admin-pop-in` keyframes for real
  entrance animation, and a `prefers-reduced-motion: reduce` block collapsing every transition/
  animation duration to near-zero for users who've asked for that.
- Both the light and dark token blocks got matching upgrades (new shadow tiers, `--admin-accent-
  hover`, `--admin-surface-raised`) so nothing regresses between themes.

**Primitives updated to actually use the new interaction classes** (mechanical, one line each in
most cases): `Button`, `IconPillButton`, `ThemeToggle`, `LogoutButton`, `Tabs` (tab buttons),
`Modal`'s close button — all gained `.admin-btn`. `Table`'s `Tr` now defaults to `.admin-row-hover`
(opt-out via a new `hover={false}` prop for the rare non-interactive-row table). `Card` gained an
`interactive` prop (+ `onClick`) that applies `.admin-card-interactive` for whole-card hover-lift,
used by the project/platform pickers below. `Modal`/`Popover` gained real entrance animation
(fade + scale/translate) and moved from `-shadow-md`/no-shadow to `-shadow-lg`. `EmptyState`'s icon
now sits in a soft tinted circle instead of floating bare. `PageHeader`/`Card` title, `Badge`, and
`Toggle` all moved onto the new type-scale tokens and the shared `--admin-ease`/duration tokens
instead of ad-hoc per-component values.

**`AdminShell.jsx` (the nav chrome every dashboard screen lives inside)**: nav rows gained real
hover feedback (previously only active-vs-inactive static colors, nothing in between) and a
chevron that rotates open/closed — there was previously zero visual indication a section was even
expandable/collapsible, only discoverable by already knowing to click it again. Sidebar gained a
barely-there directional shadow for separation from the main content pane (previously a bare
1px border only). Title now truncates with a tooltip instead of silently overflowing for a long
project name. The "back to projects" link gained a proper hover-highlight hit target.

**`AdminProjectPicker.jsx`/`AdminPlatformPicker.jsx`** (the first two screens after login — the
"front door", picked for dedicated attention beyond what the primitive upgrades alone provide):
each project/platform row is now a genuinely clickable `Card` (`interactive`, whole-row `onClick`
→ choose/pick, with `stopPropagation()` on the inner action buttons so "Delete"/"Set default"
don't also trigger navigation) with hover-lift, not just a static card containing a separate
"Choose"/"Open" button. Projects gained a folder-icon badge (platforms already had one) for
visual rhythm/scannability down a list. Both moved onto the new type scale.

**Deliberately not touched in this pass** (real scope limits, not oversights) — the individual
Feeds/Surveys detail panels, the post/survey editors, and the Participants analysis hub's own
charts/tables. These automatically inherit the primitive-level wins (button hover, card shadow,
table row hover, type scale) wherever they already use the shared components, but none has had its
own dedicated layout/hierarchy pass yet — a natural phase 2 if this direction continues.

**Verified live**, dev server confirmed working in this environment (`npm run dev`, no login
available — same standing limitation as everywhere else in this file, worked around with the
established fake-session/mocked-fetch and direct-component-mount techniques already documented
repeatedly in this file): a real screenshot of the live login/project-picker pages taken *before*
any change, for an honest baseline (confirmed via that screenshot: flat cards, no depth, an
orphaned-looking logout button that turned out to just be a narrow-viewport flex-wrap artifact —
checked and ruled out at real desktop width via `getBoundingClientRect`, not a real layout bug).
After the changes: confirmed via direct CSS-rule inspection (not just eyeballing a screenshot,
since this sandbox's synthetic hover doesn't reliably trigger real `:hover` matching — the same
caveat this file already documents for click/hover simulation elsewhere) that `.admin-btn`/
`.admin-card-interactive`'s hover/active/focus rules are correctly registered and applied, with
real computed `transition`/`box-shadow` values reading back correctly; live-mounted the real
`Card`/`Badge`/`Button`/`PageHeader` primitives with fabricated project data and confirmed the new
layered shadow, icon badges, and 2xl page-title scale render as designed, in both light and dark
mode (screenshotted both); live-mounted the real `AdminShell` (wrapped in a `MemoryRouter`, since
it needs real router context) with fabricated nav state and confirmed the rotating chevron, nav
hover, and sidebar separation all render correctly in both themes. All 17 touched files parse
clean (`@babel/parser`) and `tokens.css`'s braces balance. **Not verified**: an actual click-through
by a real logged-in admin — same standing limitation as everywhere else in this file. Worth a real
look on `staging.studyfeed.org` before assuming this is pixel-perfect beyond what live
component-mount verification already covered.

## UI/UX modernization, phase 2: Feeds/Surveys detail panels + chart/stat-tile redesign (2026-08-21)

Direct follow-up to phase 1 ("design-token overhaul + shared primitives + entry screens/nav
chrome", above) — user asked for phase 2 specifically. Scoped to exactly what phase 1's own
"deliberately not touched" list named: the Feeds/Surveys detail panels and the Participants
analysis hub's charts/tables. The post/survey editor internals
(`components-admin-surveys-editor.jsx`, 8,300+ lines) were deliberately left alone again — same
"real scope limits, not oversights" reasoning as phase 1, now doubly true given that file's own
documented fragility (the "N places to update" footguns, the Fast-Refresh-can't-hot-patch gotcha).

**Loaded the `dataviz` skill before touching any chart code**, per its own trigger conditions
("chart colors", "stat tile"). This directly shaped the work, not just a formality:

- **Found a real categorical-color mistake**: `EngagementBarChart`'s three-series chart
  (Reacted/Commented/Shared) was reusing the semantic `--admin-info`/`-success`/`-warning` tokens
  as chart-series colors — exactly the "status color doing double duty as series identity"
  anti-pattern the skill calls out (those tokens are tuned for badge/border contrast, not
  chart-mark identity). Ran `validate_palette.js` on the actual token values: light mode passed
  with a floor-band CVD warning (legal only with direct labels — which the chart already has);
  **dark mode failed outright** on the lightness band (all three dark variants sat at L 0.71–0.84,
  too light/uniform for a dark chart surface — a genuinely different requirement than looking fine
  as text/badge ink). Fixed by adding dedicated `--admin-chart-1/-2/-3` tokens (light + dark,
  independently validated — the dark values are a re-stepped set, not the light hexes reused) in
  `tokens.css`, separate from the semantic tokens, and pointed `ENGAGEMENT_SERIES` at those instead.
- **Applied the mark-spec checklist** to every plain-div chart in the participants hub
  (`EngagementBarChart`/`SubmissionsTimeChart` in `components-admin-participants-feed.jsx`,
  `MiniHistogram`/`CategoryBarList` in `components-admin-participants-survey.jsx`): bars now grow
  from a square baseline with a **4px rounded data-end only** (not uniform corners), a recessive
  full-width track behind each fill (so a 0% or low bar still shows where 100% would be — previously
  a low value just produced a nearly-invisible sliver with no context), smooth width/height
  transitions on the shared motion tokens, and text/labels kept on text tokens (muted/text), never
  the series color — already true here, confirmed rather than assumed.
- **A real bug caught only by live-rendering the chart, not by reading the code**: while verifying
  the new percentage labels, `62.00000000000001%`-style floating-point artifacts showed up.
  Traced to a dropped `Math.round()` — the pre-existing `clampPct()` helper only clamps 0–100, it
  never rounds, and the original code's inline `Math.round((d[s.key]||0)*100)` got lost when this
  pass introduced the shared `pct` variable. Fixed (`Math.round(clampPct(...))`); the sibling
  `CategoryBarList` already had its own explicit `Math.round(...)` and was unaffected. Worth
  restating the lesson plainly: a live-mounted component check with real-ish fabricated values
  (0.07, not a round number) caught this immediately; a code read alone had already missed it once.

**`StatCard`** (`components-admin-participants-feed.jsx`, also reused by
`components-admin-participants-survey.jsx` and now `components-admin-feeds.jsx`, see below): gained
a resting shadow (`--admin-shadow-xs`) and moved onto the type-scale tokens — per the dataviz
skill's stat-tile contract (label sentence-case, value in sans semibold). No prop-shape change, so
every existing call site picked this up for free.

**`components-admin-feeds.jsx`** (the Feeds detail panel, previously untouched by phase 1):
- Feed-list sidebar rows had the identical `transition: "all 0.15s ease"` + zero-hover-on-inactive-
  rows gap `AdminShell.jsx`'s nav had before phase 1 fixed it there — same fix applied here
  (`.admin-row-hover` on inactive rows, token-based transition instead of `all`).
- The detail header was a bare `<h3>`, the only top-level admin screen not using the shared
  `PageHeader` — swapped in, now consistent with every other section.
- The Settings tab's "Overview" card used to repeat the feed name/id as its own card title
  (redundant now that `PageHeader` shows it above every tab) and displayed Total/Submitted/Avg-time
  as three bare, unstyled `<div>`s — replaced with `StatCard`s (matching how the Feed Participants
  page already showed the same numbers) and renamed the card to plain "Overview".
- The Posts table's data rows were raw `<tr>` (no hover), while the shared `Tr` component (with
  `.admin-row-hover` baked in by default since phase 1) sat unused right next to them — swapped in.

**`components-admin-surveys.jsx`**: the exact same `surveyListButtonStyle`/list-row gap as Feeds
(byte-for-byte identical `transition: "all 0.15s ease"`, confirmed via diff — this function was
clearly written by copying the Feeds one) — fixed the same way. The survey detail header (name +
linked-feed/page-count + the Preview button added in an earlier session) was also a bespoke flex
row, not `PageHeader` — migrated (title = survey name, subtitle = the feed/page-count line, actions
= the Preview button + hidden import-file input), matching Feeds' header now too.

**`components-admin-participants-feed.jsx` / `-survey.jsx`**: beyond the chart work above, found
and fixed the same "shared `Tr` component exists and is imported-but-unused-in-favor-of-raw-`<tr>`"
gap in three more data-row tables (per-post interactions, latest submissions, group-comparison
measures/responses tables) — mechanically swapped via a small script that pairs each `<tr key=...>`
with its own next `</tr>` (verified count-matched before/after: 3 pairs per file, header-only `<tr>`
rows — which correctly have no `key` prop — left untouched).

**`components-admin-editor-ui.jsx`** (shared primitives for all three post editors): `EditorSection`'s
collapse-toggle header button had no `.admin-btn` class (no hover/press feedback, same gap as
everywhere else phase 1 found it) — added, plus rounded the button's own corners to match the
card's radius so the hover/focus treatment doesn't visually poke past the card's rounded edge.

**Verified live**, dev server confirmed working (no admin login available — same standing
limitation as phase 1, same fake-session/live-component-mount techniques): all 5 touched `.jsx`
files plus `tokens.css` parse/brace-balance clean. Live-mounted the real `StatCard` + a faithful
reproduction of `EngagementBarChart` (verbatim logic, since the real chart functions aren't
exported) via the established cache-busted dynamic-import technique — confirmed in **both** light
and dark mode: the validated chart-token colors render correctly (computed
`rgb(57,135,229)/rgb(25,158,112)/rgb(201,133,0)` in dark mode, matching the new dark tokens
exactly), the rounded-data-end/track bars render correctly, and percentages are clean integers
post-fix. One false alarm along the way, worth naming: a quick hand-rolled `.card` div reproduction
(not the real `Card` component) showed washed-out dark-mode text in a screenshot; re-checked via
`getComputedStyle` before concluding anything, found the real color (`rgb(232,234,237)` on
`rgb(16,18,23)`) was correct all along — the screenshot's compression was misleading, the sloppy
harness (not the real code) was the actual problem. Re-ran the check against the real, properly-
imported `Card` component afterward for an accurate result. **Not verified**: an actual
click-through by a real logged-in admin — same standing limitation as phase 1 and everywhere else
in this file. Worth a real look on `staging.studyfeed.org`, same recommendation as phase 1.

**Still not touched, for a future phase 3 if this continues**: the post/survey editor internals
(the actual question-card/page-block editing UI, and the Facebook/Instagram/Amazon post editors'
own field layouts) — these are large, fragile files where phase 1 and 2 both deliberately drew the
line; the individual admin Users page beyond what it already inherits from shared primitives; and
the Feed/Survey preview modals' own chrome (they already use the shared `Modal`, but haven't had a
dedicated layout pass).

## UI/UX modernization, phase 3: post/survey editor internals, Users page, preview-modal chrome (2026-08-22)

Direct follow-up — user asked for "phase 3" specifically, picking up exactly where phase 2's own
"still not touched" list left off (immediately above). Scoped the same way as phases 1–2: additive
button-hover/consistency wins layered onto the existing primitive system, no data-model or logic
changes, and — per phase 2's own explicit caution — the 8,300+-line
`components-admin-surveys-editor.jsx` was touched *mechanically only* (adding a `className`, never
restructuring JSX), respecting this file's own standing fragility warnings (the "N places to
update" footguns, the Fast-Refresh-can't-hot-patch gotcha documented earlier in this file).

**Root cause found before editing anything**: `.admin-btn` (the shared hover/press/focus-ring
class from phase 1's `tokens.css`) had never actually reached three of the areas phase 2 flagged —
confirmed via grep, not assumed. `src/admin/ui/IconButton.jsx` already delegates to `Button`
(which has had `.admin-btn` since phase 1), so every `IconButton`/`IconOnlyButton` consumer across
the whole admin app was already covered automatically — but every **hand-rolled** `<button>` in
these three areas (not routed through `IconButton`/`Button`) had zero hover feedback, exactly the
gap phase 1's own tokens.css comment describes ("every color they use is set inline... these
classes deliberately work via filter/transform/box-shadow overlays... so they layer correctly on
top of *any* inline background").

**Post editors** (`components-admin-editor-{facebook,instagram,amazon}.jsx`,
`components-admin-media-instagram.jsx`): found via grep — exactly 5 raw `<button>` elements across
all three editors + the Instagram media fieldset, all pre-existing and un-networked to the shared
button system. The three "🎲 Fill with random content" buttons (byte-identical across all three
editor files, the same near-duplicate-file shape this repo's CLAUDE.md documents everywhere else)
and the Instagram carousel's two `Thumb`/remove-image buttons all gained `className="admin-btn"`,
nothing else changed. `components-admin-editor-ui.jsx` (the shared `EditorSection`/`Field`/
`PreviewPane` primitives every post editor already builds on) was left alone — its own collapse
toggle already picked up `.admin-btn` in phase 2.

**`components-admin-surveys-editor.jsx`**: 31 raw `<button>` tags found via a script that parsed
every `<button ...>` opening tag and confirmed **zero** already had a `className` — safe to add
`className="admin-btn"` uniformly with no risk of clobbering or duplicating an existing class.
Applied via a small Python pass (insert `className="admin-btn"` on its own line, matching this
file's own indentation, immediately after every standalone `type="button"` line; the one button
written on a single line — `PageBlocksEditor`'s "+ Add block" — was fixed by hand afterward since
the script only matched the multi-line pattern) rather than 31 individual manual edits, specifically
to eliminate the risk of a typo mismatching a stale `old_string` somewhere in a file this large and
this fragile. Covers every shared local button primitive this file defines
(`SecondaryPillButton`, `RequiredToggleButton`, `RichToolbarButton`, `smallActionButtonStyle`/
`compactArrowStyle`-styled move-up/down arrows used identically in `QuestionActions`,
`CollapsedQuestionRow`, and `PageBlocksEditor`) plus every genuine one-off button (avatar-picker
trigger, add-question category chips/type cards, attention-check toggle, select-all/clear-selection,
add-item, remove-condition, experiment-group add/delete/reorder, the survey-health popover trigger
and its jump-to-question rows). `AddQuestionTypeCard` already had its own hand-rolled JS-state-driven
hover-lift (predating phase 1) — `.admin-btn` layers on top harmlessly there (contributes the
`:focus-visible` ring this card didn't have before; its own inline `transform` always wins over the
class's `:active` scale-down, a minor redundancy not worth a special case). Confirmed via a second
pass of the same parser script, post-edit: all 31 tags now carry `className`, zero misses.

**`components-admin-users.jsx`**: the standalone Users & access page (mounted outside `AdminShell`,
so it never inherited phase 1's `AdminShell.jsx` nav-row fix) had the identical "list row with no
hover, no transition" gap phase 2 already found and fixed twice (Feeds, Surveys) — `userRowStyle`
gained the same `transition` line, and the row `<button>` gained `className={isActive ? undefined :
"admin-row-hover"}`, byte-for-byte matching `feedListButtonStyle`'s established pattern. Also fixed:
`ChoiceChip` (the "All projects"/"Selected projects only" switch and per-project platform chips),
`SegmentedControl`'s role/viewer/editor/owner pills, `UsernameEditor`'s collapsed "Set a
username"/"Edit username" link, and the "← All projects" back link — all raw buttons with zero
hover/press feedback before this, now all `.admin-btn`.

**Preview-modal chrome** (`components-admin-survey-preview.jsx`): `FeedPreviewModal` already had a
proper elevated toolbar bar (sticky, `--admin-surface-alt` background, bottom border) around its
reshuffle button — `SurveyPreviewModal`'s equivalent control row (group selector, reshuffle, Force
response, Preview-as-mobile) was a bare flex row with no visual grouping at all. Gave it the same
treatment (`padding`, `border-radius: var(--admin-radius-md)`, `--admin-surface-alt` background,
`--admin-border-subtle` border) so the two preview modals read as one consistent system instead of
one having a "toolbar" and the other just floating controls. `Modal.jsx` itself (shared by both)
was checked and confirmed to already carry every phase 1 win (fade/scale entrance animation, real
shadow tiers, `.admin-btn` on its close button) — no change needed there.

**Verified live**, dev server confirmed working in this environment, no admin login available (same
standing limitation as phases 1–2, same fake-session/mocked-fetch/cache-busted-dynamic-import
techniques already established): all 7 touched files parse clean (`@babel/parser`). Live-mounted
the real `AdminUsersPage` (fake session, real Edge Function calls correctly 401'ing against the
fake token — expected, not a bug) and confirmed all 5 rendered buttons, including the previously-bare
"← All projects" link, carry `.admin-btn`. Live-mounted the real `SurveyPreviewModal` with a
fabricated survey/experiment-groups and confirmed via `getComputedStyle` the new toolbar bar
renders with a real background/border/radius (screenshotted too — reads as a genuine control bar
now, not floating text). Live-mounted the real `SurveyEditor` (wrapped in the real
`ToastProvider`/`ConfirmProvider`/`PromptProvider`, a fabricated 2-question/1-block/2-group survey)
and confirmed **all 31 rendered buttons** — not just the 31 source occurrences — carry `.admin-btn`,
including real question-card controls (Optional/Required toggle, Move up/down, collapse, "Save this
page's questions to the library", insert-above/below, the survey-health popover trigger) sampled
directly via their `title`/`aria-label` text; zero console errors beyond the two expected 401s from
the fake session. **Not verified**: an actual click-through by a real logged-in admin, or any real
mouse hover (this sandbox's synthetic `hover` events don't reliably trigger real CSS `:hover`
matching, a caveat this file already documents finding more than once) — class presence and
computed non-hover styles were confirmed directly instead, the same substitute-verification
approach phases 1–2 both used for the identical reason.

**Deliberately not touched, staying out of scope for this phase too**: no restructuring of
`components-admin-surveys-editor.jsx`'s actual layout/hierarchy (only `className` additions —
touching JSX structure in this file is exactly the risk phase 2 named for skipping it, and nothing
here required it), the Facebook/Instagram/Amazon post editors' own field *layouts* (only the
handful of raw buttons found via grep were touched, not `EditorSection`/`Field` usage patterns), and
`FeedPreviewModal`'s toolbar (already had the bar treatment `SurveyPreviewModal` was missing — no
change needed).

## Project picker redesign: consistent header buttons, one card instead of N (2026-08-22)

Direct follow-up, same day as phase 3 above, prompted by specific visual feedback on
`AdminProjectPicker.jsx`: header buttons had inconsistent sizes and some had no visible box at all,
and the per-project list was "big separate boxes for each project" repeating the same three buttons
every row. Two more direct follow-ups landed mid-fix: "the choose button is probably unnecessary
since [you] can just click on the project" (confirmed — the card was already `interactive` with
`onClick=chooseProject`, so "Choose →" was always redundant with the row click, just never removed),
and "the delete button could be like the other delete buttons throughout the platform, like the bin
icon" (matching the icon-only `IconTrash` pattern already used in `components-admin-feeds.jsx`'s
Posts table, rather than a full-width "Delete" text button).

**Root cause of the header inconsistency, confirmed by reading `Button.jsx` rather than guessed**:
`variant="ghost"` sets both `background` and `borderColor` to `transparent` — so "Manage users" and
"Refresh" (both ghost) rendered as literally invisible boxes, just floating text, while
`ThemeToggle`/`LogoutButton` (34px icon buttons with a real border/background) and the unstyled
`+ New project` (defaults to `variant="secondary"`, which does have a border) sat right next to
them with a real box. Separately, `Button`'s `sm` size is 30px tall while `ThemeToggle`/
`LogoutButton` are hardcoded to 34px — a real, confirmable 4px mismatch, not just a subjective
impression. Same two bugs (ghost-with-no-box next to boxed icon buttons, 30-vs-34px height) were
also present in `AdminPlatformPicker.jsx`'s "← All projects" and `components-admin-users.jsx`'s
"Refresh"/"+ Add user" — the identical header-row composition repeated across all four top-level
admin pages (project picker, platform picker, users page, and `AdminShell`'s own dashboard header,
which was already consistent and untouched here) — so fixing only the project picker would have
left it looking *different* from its sibling pages instead of consistent with them. Fixed
identically in all three: `variant="ghost"` → `variant="secondary"` (or `"primary"` for the
already-boxed primary action) and an explicit `style={{ height: 34 }}` override on each. Deliberately
**not** a change to `Button.jsx`'s shared `SIZES` map itself — `sm` (30px) is used throughout the
admin app (e.g. every dense table row-action button), and widening it globally to fit this one
header row would have rippled into places that were never part of the complaint; a local style
override is the surgical fix, same "don't touch the shared primitive when a call-site override is
enough" judgment call phase 3 already made elsewhere.

**Project list restructured from N `Card`s to one.** Each project used to be its own elevated,
shadowed `Card` (border + shadow + rounded corners, repeated per project) containing "Set default" /
"Delete" / "Choose →" as three separate `Button`s. Replaced with a single `Card`
(`bodyStyle={{padding:0}}`) containing one plain divided row per project (`border-bottom` between
rows, none on the last) — the box count no longer scales with how many projects an account has.
Each row is the full click target (`role="button"`, `tabIndex`, `onKeyDown` for Enter/Space, wrapped
in `.admin-row-hover` for the same background-only hover `tokens.css` already defines for exactly
this "list row, not a card" case) instead of relying on `Card`'s own `interactive` prop (which drives
a hover-*lift*, appropriate for a handful of big standalone cards like the platform picker's 3 fixed
options, not for a dense divided list). "Choose →" is gone entirely, per the direct feedback above —
confirmed nothing else in the row's own click handling assumed that button's presence. "Delete"
became an icon-only `IconButton` with the shared `IconTrash` (danger-styled, matching the red/bordered
severity cue the old text button had, not the plain-ghost treatment the Posts-table precedent uses
for a single post — deleting a whole project cascades to every feed/participant in it, a genuinely
bigger action worth keeping visually distinct). "Set default" became an icon-only `IconButton` using
`IconBookmark` — outline when not default, filled (`fill="currentColor"`, overriding the icon set's
own default `fill="none"`) when it already is, so the action and its current state are the same
glyph rather than a button whose only state cue was being disabled. A plain, non-interactive
chevron (`aria-hidden`, new `IconChevronRight` — didn't exist in the shared icon set before this,
added alongside the others in `src/admin/ui/icons.jsx`) sits at the row's trailing edge as a passive
"this opens something" affordance, replacing the wayfinding "Choose →" used to (weakly) provide.

**Verified live**, dev server confirmed working, no admin login available (same standing limitation
as phase 3 and everywhere else in this file): the real `AdminProjectPicker` was loaded with a faked
session — confirmed the header row renders all five actions at a consistent boxed 34px height
(screenshotted). The real backend calls this page makes on mount didn't resolve in this sandbox
(no matching network request ever appeared, even after a 2s wait and a broad `window.fetch` mock
covering `/rest/v1/projects` — likely resolving to a GAS or otherwise-unreachable path in this
environment's `.env`, not something this change touched or needs to explain), so the list body
specifically was verified by mounting the exact same JSX (same `Card`/`IconButton`/`Badge`/icon
components, real fabricated project data including one default and one current project) via the
established cache-busted dynamic-import technique instead — confirmed via screenshot: one shared
card with divider lines (not three separate boxes), the bookmark correctly outline-vs-filled between
the non-default and default rows, the trash icon rendering with its danger border, and the trailing
chevron — matching the design exactly. Not verified: an actual click-through by a real logged-in
admin, or the real project-loading network path in this specific sandbox (a pre-existing environment
limitation, not something introduced or masked by this change).

**Follow-up, same day: `AdminPlatformPicker.jsx` converted to the identical pattern.** Direct
request — the platform list (Facebook/Instagram/Amazon, always exactly 3 fixed options) had the
same "Open →" redundancy and the same one-elevated-Card-per-item shape the project list just moved
away from. Converted identically: one `Card` with a divided row per platform, no button (the row's
`onClick`/`onKeyDown` already does what "Open →" did), a trailing `IconChevronRight`. No secondary
per-row actions exist here (no delete/default equivalent for a fixed 3-item list), so the row is
simpler than the project list's — just the icon/label/blurb on the left and the chevron on the
right, no `stopPropagation` wrapper needed since there's nothing else clickable inside a row.

**Verified live**, same standing no-admin-login limitation as everywhere else in this file — this
mount hit a real, worth-remembering gotcha along the way: a first attempt bare-imported
`react-router-dom` via `/node_modules/.vite/deps/react-router-dom.js?t=<timestamp>` for a
`MemoryRouter` wrapper, which produced a *different* module instance than the one
`AdminPlatformPicker.jsx` itself resolves internally for `useNavigate()` — Vite's dependency
pre-bundling cache-busts by a stable content hash (`?v=6d36cd15`), not a fresh timestamp per import,
so a timestamped bare import silently creates a second, contextually-disconnected copy of the
library. This produced a real, reproduced console error (`useNavigate() may be used only in the
context of a <Router> component`) and an empty render — not a bug in the component, a bug in the
verification harness. Same root cause and same fix this file already documents once before for a
different pair of modules (`AdminTreeSlotsContext`, under "merged tree-sidebar navigation" earlier
in this file): fetched `AdminPlatformPicker.jsx`'s own transformed source, regexed out the exact
`react-router-dom` URL it actually imports (`?v=6d36cd15`, not a timestamp), and re-imported both the
component and `MemoryRouter` through that exact URL — the mount then rendered all 3 rows correctly,
confirmed via screenshot (one shared card, correct icons/blurbs, "(currently loaded)" tag on
Facebook, chevrons on every row, zero further console errors). Separately confirmed `getProjectId()`
was never the problem — the very first failed attempt already read the seeded `current_project_id`
localStorage key correctly; the empty render was purely the router-context mismatch.

## Instagram gets its own "Realistic surroundings" (2026-08-22)

Direct request, following a real Facebook desktop screenshot comparison (same trigger this file's
earlier "Realistic surroundings" entries for Facebook already used): "Instagram doesn't have
realistic Instagram left and right grid" — flagged in the same message as deciding webcam eye
tracking (discussed but not built, see the two prior human turns — no CLAUDE.md/plan-file trace of
it either, since it never got past the discussion stage) isn't worth pursuing right now, since the
side rails aren't interactive anyway.

**Investigated before writing any code** (a research agent mapped Facebook's existing
`realistic_surroundings`/`realistic_surroundings_avatars` implementation against Instagram's current
state end-to-end before any design decisions were made): Instagram already had its own local
`PageWithRails` (`App-instagram.jsx`) and `RouteAwareTopbar`/`TopRailPlaceholder`
(`ui-core-instagram.jsx`) — but both were **ghost-skeleton-only**, with no `flags` threaded in at
all and no real-content branch — this was a real gap to build, not a bug to fix. The
`realistic_surroundings`/`realistic_surroundings_avatars` flags already correctly reached
Instagram's `flags` object (each `App-*.jsx`'s own `normalizeFlags()` — the exact footgun that
silently broke this once before for the original three realism flags, see the 2026-08-06 postmortem
above — was already fixed identically in all three files); nothing downstream just read them yet.
Instagram's own name pools (`IG_FEMALE_NAMES`/`IG_MALE_NAMES`) and the seeded-random primitives
(`pickDeterministic`/`pickUniqueDeterministic`/`getAvatarPool`) were already there, fully
platform-agnostic, and reused as-is — no Instagram-flavored variant needed for those specifically.

**Deliberately not a re-skin of Facebook's rails — real Instagram's desktop layout is
structurally different, so the build followed the reference screenshots, not Facebook's shape**:
- **Left rail**: real Instagram has no "shortcuts"/groups sub-list under its nav the way Facebook
  does — just one flat, fixed nav list (Home/Reels/Messages/Search/Notifications/Create/Profile/
  More/Also from Meta). New `LEFT_RAIL_NAV_ITEMS`/`LEFT_RAIL_ICONS` (`ui-posts-instagram.jsx`) are
  simple monochrome stroke icons (matching real Instagram's understated nav), not Facebook's
  colored-circle-badge treatment — a new local `RailNavIconGlyph` was written for Instagram rather
  than reusing Facebook's (different visual language, not shareable). A red "1" unread-count badge
  on Messages (matching the reference screenshot) was built and then removed the same session, per
  direct instruction — Facebook's own `TopRailReal` had an identical badge removed for the same
  reason at some point before this session (confirmed: `.trp-real-badge` still exists as dead CSS in
  `styles-facebook.css`, but nothing in `ui-core-facebook.jsx`'s JSX renders one anymore) — a
  notification-style badge is flagged as a real confound risk, not just clutter, so this repo's
  precedent is to leave rail/nav chrome free of anything that looks like live state. Removed
  `LEFT_RAIL_NAV_BADGES` and `.rail-real-badge` entirely from Instagram (not just hidden) rather than
  leaving Facebook-style dead code behind.
- **Right rail**: no profile-switcher block at the very top (the reference screenshot's
  "jason.we / Jason / Switch" is Jason's own real personal Instagram identity, captured incidentally
  in his reference screenshot — not something to bake into the app, and this environment has no
  concept of a logged-in participant identity to show there anyway) — went straight to "Suggested
  for you", the actually-valuable part. New `buildRailContacts` (`ui-posts-instagram.jsx`), a direct
  counterpart to Facebook's function of the same name (same seeded-by-run-identity mechanism, same
  `femalePool`/`malePool`-empty-means-no-photos contract for the `realistic_surroundings_avatars`
  sub-toggle), swapped to Instagram's own name pool and a canned per-suggestion secondary line
  (`"Suggested for you"`/`"New to Instagram"`/`"Followed by people you follow"`/`"Popular in your
  area"`, deterministically picked) instead of Facebook's online-dot presence indicator, plus a
  decorative (inert, same as everything else in `.rail`) "Follow" label per row.
- **Top bar**: real desktop Instagram has no search bar/nav-tab row across the top at all (unlike
  Facebook) — everything lives in the left rail instead, and the only thing actually present up top
  is the small glyph logo. New `TopRailReal` (`ui-core-instagram.jsx`) reflects that directly rather
  than inventing content that isn't on the real site: renders the small Instagram camera-glyph icon
  in `.trp-left`, leaves `.trp-center`/`.trp-right` empty. `RouteAwareTopbar` gained the same
  `{ flags }` prop + real-vs-placeholder branch Facebook's already has.

**Wiring**: `PageWithRails` (`App-instagram.jsx`) gained the same `{ children, flags, runSeed, app,
projectId, feedId }` signature Facebook's already has, plus the real-vs-ghost branch — its one call
site (previously invoked with zero props) now threads all five through, and `<RouteAwareTopbar />`
now passes `flags` too. No `showRails` prop was needed here (unlike Facebook's, which needs one to
stop `Feed`'s own internal rail duplicate from double-rendering when nested) — confirmed via the
research pass that `IGFeed` (`ui-posts-instagram.jsx`) renders no rail markup of its own at all, so
there's no analogous double-render risk to guard against.

**Flags reused, not duplicated**: both flags are already per-feed, and a feed always belongs to
exactly one platform, so reusing the identical `realistic_surroundings`/`realistic_surroundings_avatars`
names across Facebook and Instagram is safe (same precedent as `realistic_pacing`/`allow_dark_mode`,
which already work this way) — no new flag, no new admin-UI wiring needed beyond fixing the
`FLAG_KINDS` label (`components-admin-dashboard.jsx`), which said "Realistic surroundings (Facebook
rails)" and would've become actively misleading; changed to "Realistic surroundings (nav &
suggestions rails)". Confirmed `components-admin-feeds.jsx`'s per-platform toggle filter only ever
excluded Amazon from this pair, never Instagram — so Instagram's admin dashboard was already showing
both toggles (as silent no-ops) before this session; they just start working now, with zero
additional admin-UI change needed.

**A real pre-existing gap found and fixed while in this area, not introduced by this work**:
`styles-instagram.css`'s `.top-rail-placeholder` had **no dark-mode override at all** — unlike
Facebook's identical bar, which got one when this exact class of bug was fixed there (see "Dark
mode, round 5" above) — meaning Instagram's top bar (even the pre-existing ghost version) has been
hardcoded white regardless of theme since dark mode shipped. Since `TopRailReal` reuses this exact
class, shipping it without the fix would have put a dark-appropriate logo on a stubbornly-white bar.
Fixed alongside (`.dark-mode .top-rail-placeholder{ background:var(--ig-card); border-bottom-color:
var(--ig-line); }`), and the new logo itself uses `stroke="currentColor"`/`fill="currentColor"` (not
a hardcoded color) so `.trp-real-logo{ color:var(--ig-text) }` themes it automatically. Also added
`.page .container.feed{ position:relative; z-index:1 }` / `.rail{ z-index:0 }` proactively — the
exact same real popover-behind-rail bug Facebook hit and fixed is preventable here for free, same
cause (two `position:sticky` siblings with ambiguous auto z-index), same fix, applied before it can
recur rather than waiting for the identical report a second time.

**New CSS, all theming automatically via existing `--ig-*` custom properties (not hardcoded hex +
a separate `.dark-mode` override block, unlike Facebook's version of this same CSS, which does need
the extra override block precisely because it hardcoded `#fff` instead of using a token)**:
`.rail--content`, `.rail-real-title`, `.rail-real-list`, `.rail-real-item`, `.rail-real-badge`,
`.rail-real-item-text`/`-name`/`-secondary`, `.rail-real-follow`, `.rail-contact-avatar-wrap`/
`-avatar`/`-avatar--blank`, `.trp-real-logo` — added to `styles-instagram.css`.

**Verified live**, dev server confirmed working, no admin login available (same standing limitation
as everywhere else in this file): real end-to-end verification through a live feed URL wasn't
possible (no reachable backend project/feed in this sandbox, same limitation noted throughout this
file) — instead verified the two real risk areas directly. `RouteAwareTopbar` (exported) was
mounted for real with `flags={{realistic_surroundings:true}}` inside a `MemoryRouter` — confirmed
live at desktop width (1280px; the sandbox's default ~400px width made `useIsMobile(700)` correctly
return `null`, a regression-confirming, not broken, result) that the real Instagram glyph renders in
`.trp-left` with `.trp-center`/`.trp-right` genuinely empty, screenshotted. `PageWithRails` itself
isn't exported (matching Facebook's own, also-unexported original), so its real-content JSX was
reproduced in a harness using the actual exported `LEFT_RAIL_NAV_ITEMS`/`LEFT_RAIL_ICONS`/
`buildRailContacts` (not reimplemented) with fabricated avatar-pool URLs — confirmed 9 real nav
rows and 5 suggestion rows with distinct deterministic names/secondary lines, in **both** light and
dark mode (screenshotted both — dark mode correctly resolved to pure black `--ig-card`/`#f5f5f5`
`--ig-text`, matching real Instagram's own dark mode, with the red accent color correctly unchanged
between themes). Re-verified after the badge removal (same session, per direct instruction — see
below): re-mounted the same harness and confirmed zero `.rail-real-badge` elements render and the
Messages row reads as plain text, screenshotted. Zero console errors throughout. All four touched
files (`App-instagram.jsx`, `ui-posts-instagram.jsx`, `ui-core-instagram.jsx`,
`components-admin-dashboard.jsx`) parse clean and `styles-instagram.css`'s
braces balance. **Not verified**: an actual click-through by a real logged-in admin toggling this on
for a real feed, or a real participant page — same standing limitation as every "Realistic
surroundings" entry in this file. Amazon still has no rail/surrounding-chrome concept at all
(`Feed` is a single centered column there) — unchanged, still flagged as a bigger, separate
follow-up if ever wanted, per the original 2026-08-06 entry's own "other realism ideas discussed but
not built" note.

## Instagram realistic surroundings, round 2: spacing, fewer suggestions, floating Messages pill (2026-08-22)

Three more direct-feedback fixes the same day, against a screenshot of a real Instagram
floating "Messages" pill widget (bottom-right on real Instagram; placed bottom-left here per
explicit instruction):

- **Left nav spacing**: per-row padding/font bumped (`.rail-real-item` → `.7rem .7rem`/15px/500
  became `.95rem 1rem`/16px/600 specifically under a new `.rail-real-list--nav` modifier, applied
  only to the left nav's own `<div className="rail-real-list">` — the "Suggested for you" list keeps
  the tighter original spacing, since its own reference screenshot showed compact rows, unlike the
  nav's noticeably more spacious ones). List-level gap also bumped 2px→6px.
- **Fewer suggestions**: the height-driven `realRightCount` computation (could reach up to 12 on a
  tall viewport) was replaced entirely with a fixed `SUGGESTIONS_COUNT = 5`, matching the real
  reference screenshot exactly — real Instagram's "Suggested for you" is a genuinely short, capped
  list with a "See all" escape hatch, not a height-filling list the way Facebook's own contacts rail
  is (which has no such escape hatch, so filling available space is the correct behavior *there*).
  A decorative "See all" link was added next to the "Suggested for you" header (new
  `.rail-real-title--row`/`.rail-real-see-all` CSS) for the same reason — without it, a hard-capped
  5-item list with obvious room below would read as broken, not intentional.
- **New floating "Messages" pill** (`.floating-messages-pill`, bottom-left, `position:fixed`
  relative to the viewport): icon (reused directly from `LEFT_RAIL_ICONS.Messages` — same glyph,
  no separate icon needed) + "Messages" text + a seeded avatar circle, rendered as a sibling of
  `.page` (not nested inside a rail) specifically so `position:fixed` resolves against the real
  viewport unambiguously rather than depending on `.rail`'s own `filter` property staying `none` in
  real-content mode (a `filter` on an ancestor creates a new containing block for `position:fixed`
  descendants — true today since `.rail--content` resets it, but not worth the implicit dependency).
  The avatar is a second, distinctly-seeded `buildRailContacts` call (`"-messages-pill"` seed suffix,
  `count: 1`) — deliberately not reusing the suggestions list's own first pick, so the pill's contact
  never happens to visually match whichever name/avatar the suggestions list shows.
- **Deliberately no unread-count badge on the pill**, despite the reference screenshot showing one —
  the user's own immediately-prior instruction was to remove exactly this kind of badge from the left
  nav for being a possible confound, and this is the same category of element; flagged this directly
  rather than silently including or silently omitting it without comment, so it's easy to override
  if a badge is actually wanted here specifically.

**Verified live**, dev server confirmed working, no admin login available (same standing limitation
as everywhere else in this file). One real verification-technique gotcha hit and resolved: a first
pass navigated to the bare domain (`http://localhost:5173`, no `?app=` param) for the harness mount
— per this repo's own "Public-site access gate" feature, the bootstrap script never imports any app
bundle for a bare-domain visit, so `styles-instagram.css` was never actually loaded and every
computed style read back as a browser default (e.g. `padding: 0px`) despite the harness JSX being
correct — a false negative from the test setup, not a real bug (confirmed via `document.styleSheets`
directly: zero rules matching `.rail-real-list--nav` were loaded at all). Fixed by navigating to
`?app=ig&feed_id=verify&project=verify` instead (matching this session's own earlier, correct
verification approach) before remounting — confirmed via `document.styleSheets` that the new CSS was
actually present this time, then re-verified and screenshotted successfully: 9 nav rows at the new
padding/weight/size (`15.2px`/`600`/`16px`, confirmed via `getComputedStyle`, not just class
presence), exactly 5 suggestion rows with the "See all" link, the floating pill rendering with no
badge element in the DOM, all in **both** light and dark mode (dark mode screenshot confirmed pure
black backgrounds/white text throughout, including the pill). Zero console errors beyond expected
image-load failures from the harness's fabricated, unreachable avatar URLs. `App-instagram.jsx`
parses clean and `styles-instagram.css`'s braces balance. **Not verified**: an actual click-through
by a real logged-in admin/participant — same standing limitation as every entry in this file.

## Instagram realistic surroundings, round 3: pill moved right, avatar-toggle audited (2026-08-22)

Two more direct-feedback items the same day: the floating Messages pill should sit bottom-**right**
(correcting round 2's bottom-left, which was itself per an earlier explicit instruction — real
Instagram's own placement, and now confirmed the actually-wanted one) rather than bottom-left, and
the "Suggested for you" avatars plus the pill's own avatar should show real photos whenever
`realistic_surroundings_avatars` is on.

**Pill position**: one-line fix — `.floating-messages-pill`'s `left:24px` → `right:24px`
(`styles-instagram.css`), comments updated to match.

**Avatar-toggle audit — investigated as a possible bug, concluded the code was already correct.**
Re-read `PageWithRails`'s avatar-loading effect end to end (`showAvatars = !!flags?.
realistic_surroundings_avatars`, gates whether `getAvatarPool` is even called, feeds into both
`buildRailContacts` calls — suggestions and the pill's own separately-seeded pick), confirmed
`normalizeFlags()` doesn't drop `realistic_surroundings_avatars` anywhere in the chain (grepped for
it directly in `App-instagram.jsx`), and confirmed `pickUniqueDeterministic`/`pickDeterministic`
(`utils-core.js`) correctly return `null` only for a genuinely empty pool, never silently for a
populated one. No bug found in the code itself. Rather than only asserting this, verified it
directly: mounted the real `buildRailContacts` + the exact avatar-toggle branching logic from
`PageWithRails` in a harness, once with a **real, network-independent data-URI image** (a 1×1 PNG,
chosen specifically so the test can't be fooled by a broken-but-present `<img src>` the way the
unreachable-domain URLs used in earlier rounds' verification could) fed as the pool, once with an
empty pool — confirmed 6/6 real `<img>` elements with `naturalWidth: 1` (proof the image genuinely
decoded, not just that the attribute was set) when avatars are on, and 6/6 blank-circle fallbacks
with zero `<img>` elements when off, across both the suggestions list and the pill.

**The one real caveat, not a code bug**: `getAvatarPool` fetches real avatar photos from a
CloudFront-fronted S3 manifest, and this sandbox's `localhost` origin is not on that CDN's allowed-
origins list (see "Avatar/topic-image assets" and the 2026-08-08 CORS root-cause entries earlier in
this file) — so a real click-through *in this specific sandbox* would likely still show blank
circles regardless of the toggle, purely because the CORS-blocked fetch throws and is caught into an
empty array (`getAvatarPool`'s own `try{...}catch{return []}`). This is a pre-existing, already-
documented environment limitation unrelated to anything built this session — real participants on
`staging.studyfeed.org`/`studyfeed.org` are unaffected, only this local sandbox is.

**Verified live**: pill position confirmed via `getBoundingClientRect()` rather than a screenshot —
`right: 1256` in a `1280`px-wide viewport, i.e. exactly `24px` from the true right edge, matching
`right:24px` precisely; a screenshot taken immediately after didn't visually reflect the resized
viewport (a tooling artifact of this sandbox's screenshot capture, not a real rendering problem —
confirmed via `window.innerWidth`/`document.documentElement.clientWidth` both correctly reading
`1280` at the time), so the direct-geometry check was trusted over the visual one. All touched files
parse clean and `styles-instagram.css`'s braces balance. **Not verified**: an actual click-through by
a real logged-in admin/participant, or the avatar toggle against the real CDN outside this sandbox —
same standing limitations as every entry in this file.

## Real bug found and fixed: switching platform sent you back to the platform picker instead of the dashboard, plus a legacy Instagram-only admin gradient theme removed, plus "default project" removed (2026-08-22)

Direct bug report: picked a project, clicked Instagram on the platform picker, Facebook loaded
instead; clicked Instagram again and landed back on the platform picker (not the dashboard); the
platform picker itself rendered with two different heading styles across the two times it was seen
(one plain, one with an Instagram-branded gradient). Plus two follow-up questions/requests in the
same message: whether the whole "skip the reload if already on this platform" mechanism is even
needed, and a request to drop "default project" from the project list now that project/platform
picking is its own dedicated flow, separate from the rest of the dashboard.

**Root cause 1, confirmed and fixed: `AdminPlatformPicker.jsx`'s `pick()` was still writing a
HashRouter-era URL under BrowserRouter.** Cross-bundle platform switches (picking a platform
different from whichever is currently loaded) have to be a real page navigation — platform is
chosen by which JS bundle `index.html` loads, before React even mounts, so there's no client-side
way to swap bundles. `pick()` built that navigation URL by setting `url.hash = "#/admin/dashboard"`
— the correct mechanism back when this app used `HashRouter` (routes lived in the hash), but since
the 2026-08-14 migration to `BrowserRouter` (documented earlier in this file), hash is never read
for routing at all. Setting it was a silent no-op: the reload correctly picked up the new `?app=`
query param and loaded the right bundle, but `url.pathname` was never touched, so it was still
whatever it had been before (`/admin/platform`) — meaning the freshly-loaded bundle's own router
matched the platform picker again, not the dashboard. This is exactly "clicked Instagram, landed
back on the platform list, had to click again": the *second* click then took the `app === currentApp`
fast path (a real client-side `navigate()`, which works correctly), finally reaching the dashboard —
but by then the *first* click's bundle-swap had already silently failed to arrive anywhere except
back where it started. This also explains "Facebook was loaded" in the first place: `index.html`'s
bootstrap script defaults to `"facebook"` whenever `?app=` is absent from the URL (line 65,
`const app = (params.get("app") || "facebook").toLowerCase();`), which is exactly the case for the
very first, plain `/admin` visit before any platform has ever been explicitly chosen. **Fixed**: set
`url.pathname = "/admin/dashboard"` (and clear `url.hash`) instead of setting `url.hash`. Verified
via the pure URL-construction logic directly (no live reload possible in this sandbox): confirms the
final URL is `.../admin/dashboard?project=...&app=...`, which correctly matches `AdminEntry.jsx`'s
`<Route path="dashboard/*">` once the right bundle loads and `BrowserRouter` mounts against it.

**Direct answer to "do we need this whole loaded thing even?"**: the bug lived entirely in the
cross-bundle branch (the `else` case) — the `if (app === currentApp) { navigate("/admin/dashboard");
return; }` fast path is unrelated to it, was already working correctly, and is genuinely good UX
(skips an unnecessary full-page reload when the admin picks the platform that's already loaded).
Recommended keeping it rather than collapsing both branches into one unconditional reload, and did
— the fix only touches the branch that was actually broken.

**Root cause 2, confirmed and fixed: `styles-instagram.css` had an entire legacy Instagram-only
admin re-theme that directly explains the "one heading normal, one gradient" observation.** Two
stacked sections — literally titled "THEME IMPROVEMENTS (Option A: subtle gradient admin
background)" and "Enhanced Instagram Admin Theme (Colorful Header)" in their own comments, both
`body.admin-mode`-scoped (i.e. applying to *every* admin page, not participant-facing UI) — predate
the shared `src/admin/ui/tokens.css` design system this file's own "UI/UX modernization" phases 1–3
were built around, and directly conflict with it: **`body.admin-mode .admin-shell h1, body.admin-
mode .admin-shell h2 { background: linear-gradient(...); -webkit-background-clip: text; -webkit-
text-fill-color: transparent; ... }`** hits `PageHeader`'s `<h1>` — the exact title element every
admin page uses, including `AdminPlatformPicker`'s "Choose a platform" — with an Instagram-brand
gradient text-clip effect, but **only when the Instagram bundle happens to be the one loaded**,
since `styles-instagram.css` is a global, side-effect stylesheet import scoped to the whole document
whenever that bundle is active. Confirmed Facebook's and Amazon's stylesheets have no equivalent —
only `.admin-shell`/`.admin-fab-wrap`/`.admin-login-wrap` *structural* rules, no brand theming. This
means the exact same admin page visually differs depending purely on which of the three bundles
happens to be loaded at the time — precisely what was reported, and a real inconsistency this
session's own admin-design-system work (phases 1–3) had been working to eliminate everywhere else.

**Removed both sections entirely** (~185 lines total across the two, `styles-instagram.css`), while
preserving the legitimate `.admin-banner`/`.admin-expired-backdrop`/`.admin-expired-dialog` rules
that happened to sit physically between them (session-expiry toast + expired-session modal — a
real, necessary fix from an earlier session, confirmed by that code's own comment: "Previously
missing entirely from this stylesheet... so the session-expiring banner and expired-session modal
rendered unstyled under ?app=ig"). Also removed a third, now-dead leftover rule
(`body.admin-mode .card, ... { backdrop-filter: none !important; }`, "Hard-disable blur compositing
in admin mode to avoid flicker behind modals") — a defensive patch for a side effect of the removed
theme's own `backdrop-filter` rule on `.card`, with nothing left to override once that source rule
is gone. Kept the two remaining `body.admin-mode` selectors that were never part of the theme —
`.top-rail-placeholder`/`.nav`/`.ig-topbar` visibility toggles — since those hide *participant-
facing* chrome while in admin mode, an unrelated and still-needed concern. **Verified live**: mounted
the real `AdminPlatformPicker` with `body.admin-mode` set (matching real admin routing) and confirmed
via `getComputedStyle` on the actual rendered `<h1>` — `backgroundImage: "none"`,
`webkitTextFillColor: "rgb(17, 24, 39)"` (a real solid color, not `transparent`) — the gradient
effect is gone; brace balance and parse-check clean.

**Third item, per direct request: "default project" removed entirely**, same reasoning and the same
shape as the earlier "'Default feed' concept removed entirely" entry (2026-08-04) — now that picking
a project is always its own required step before ever reaching a dashboard (the Projects → Platform
→ Dashboard flow), the fallback almost never actually fires in practice. Turned out to be even lower
-stakes than the feed case: `getDefaultProjectFromBackend`/`setDefaultProjectOnBackend`
(`utils-backend.js`) were never real backend calls at all despite the name — just a plain
`localStorage` read/write (`DEFAULT_PROJECT_ID`), never synced anywhere. Removed both functions
entirely, plus every call site: `AdminProjectPicker.jsx` (the `defaultProjectId` state, the "default"
`Badge`, the bookmark `IconButton`/`makeDefault` toggle — the row action cluster is now just the
single Delete icon button + chevron), and `components-admin-dashboard.jsx` (the `defaultProjectId`
state, the "default" badge next to the sidebar's project-name readout, and `backendDefault` dropped
from `loadProjects`'s `desired`-project fallback chain — which now reads `fromUrl || projectId ||
getProjectId?.() || projList[0]?.project_id || "global"`, i.e. exactly the same chain minus the one
term that's been effectively dead weight since project selection stopped being optional). Confirmed
via repo-wide grep: zero remaining references to any of `getDefaultProjectFromBackend`,
`setDefaultProjectOnBackend`, `defaultProjectId`, or `DEFAULT_PROJECT` anywhere in `src/`. **Verified
live**: mounted the real `AdminProjectPicker` (wrapped in the real `Toast`/`Confirm`/`PromptProvider`s,
fabricated 2-project list via a mocked backend response) — confirmed zero bookmark icons, zero
"default" text anywhere in the rendered output, screenshotted (clean rows: name + trailing chevron
only, Delete icon gated to owner role as before).

**Not verified, all three fixes**: an actual click-through by a real logged-in admin doing the real
project → platform → dashboard flow end to end (would conclusively prove the router fix beyond the
pure-URL-logic check already done) — same standing no-login limitation as everywhere else in this
file. Worth prioritizing on `staging.studyfeed.org` given this was a real, reported, and now
understood navigation bug, not just a polish item.

## Real bug found and fixed: post editor's "X"/Escape did nothing once the post had unsaved changes (2026-08-22)

Direct report: mid-edit on a post, the admin session-expiry banner appeared, and after that neither
the post editor's "X" button nor Escape would close it. Investigated via a research agent mapping
every modal/z-index/keydown-handler involved before touching anything, since the symptom (two
independent-seeming failures — click and Escape both dead) pointed at something structural rather
than a simple missing handler.

**Root cause: a z-index inversion between two unrelated modal systems, not the session-expiry
banner itself** — though the banner's own overlay compounds the same bug class. This app has two
modal implementations that evolved independently and were never reconciled: the post editor's own
dialog (`components-admin-dashboard.jsx`) imports `Modal` from `../ui-core` — the same generic
dialog Facebook/Instagram/Amazon's real comment/share sheets use, `.modal-backdrop`/`.modal` in the
platform stylesheets, **z-index 11000/11001** — while `useConfirm()`/`usePrompt()`/plain `Modal` from
the admin design system (`src/admin/ui/Modal.jsx`) was hardcoded at **z-index 2000**. `closeEditing`
(the function behind both the "X" and Escape, since `../ui-core`'s `Modal` wires both to the same
`onClose` prop) checks whether the post is dirty and, if so, `await confirm({...})` before actually
closing — that confirm dialog renders through the *admin* `Modal` at z-index 2000, **underneath** the
post editor's own still-mounted backdrop at 11000/11001. The confirmation the user needs to answer
to close the editor was there the whole time — completely invisible and unclickable, hidden behind
the editor it was trying to close. Clicking "X" looked like nothing happened because nothing visible
did. Escape was worse than inert: since the (invisible) confirm dialog was genuinely mounted, its own
`document`-level Escape listener (`Modal.jsx`'s standard behavior) caught the next Escape press and
resolved the confirm promise as **Cancel** — silently answering "keep editing" to a question the user
never saw, so `closeEditing` correctly took its early-return branch and never closed anything. Every
further X/Escape press just repeated the same invisible cycle.

**Why the session-expiry banner is what surfaced it, without being the root cause**: this z-index
inversion reproduces any time the post is dirty when the editor is closed, independent of session
state. But `sessExpired`'s own overlay (`.admin-expired-backdrop`, full-viewport, z-index 9999, no
Escape/dismiss path of its own by design — the user is meant to be forced to re-auth) sits in the
same stacking window between the hidden confirm dialog (2000) and the editor (11000/11001), and
would independently block clicks to anything at or below z 9998 regardless of the confirm-dialog
bug. Two compounding stacking problems, not one — fixing the confirm-dialog inversion is the fix
that actually restores the reported "X does nothing" symptom, since the expired-session overlay was
never actually the thing intercepting the click in this specific report (confirmed via the research
agent's z-index trace: post editor is always the top layer of the three, so the expired overlay was
never physically in front of the editor's own "X" button — the invisible-confirm-dialog was the
real, sole cause of *that* specific symptom).

**Fix**: raised `src/admin/ui/Modal.jsx`'s hardcoded `zIndex: 2000` to `20000` — comfortably above
every z-index value used anywhere in the admin context (`../ui-core` Modal's 11000/11001, the
session-expired overlay's 9999, the session-expiring banner's 9500) — so `ConfirmDialog`/
`PromptDialog`/plain `Modal` reliably render on top of *any* other admin surface that might already
be open, which is the whole point of a confirmation dialog. Deliberately not a per-instance/dynamic
z-index stack — every real use of `useConfirm()`/`usePrompt()` in this app is invoked as a "confirm
this action within whatever's already open" pattern, so one fixed value above everything else is
sufficient and far simpler than a stacking-context scheme. **`Toast.jsx`'s `zIndex: 3000` bumped to
`21000` in the same pass**, preserving its existing (and correct) "toast always visible over a modal"
relationship — a save-failed error toast fired from inside an open dialog needs to stay visible, not
get buried under the now-much-higher `Modal`. `Popover.jsx`'s `zIndex: 1000` was left unchanged — a
popover losing to a modal that opens on top of it is already the correct/expected relationship at
either the old or new gap.

**The far larger `zIndex: 100000`/`50000`/`30000`-class values found while auditing this (in
`src/ui-posts/*.jsx` — bio-hover cards, comment/share sheets, intervention blocks) were deliberately
left untouched** — those are participant-facing feed UI, never mounted in the same route tree as the
admin dashboard (admin and participant delivery are mutually exclusive `/admin/*` vs. `/` routes in
the same `Routes` tree), so they can't collide with `Modal`/`Toast` regardless of value and don't
need to factor into this fix's headroom calculation.

**Verified live**, dev server confirmed working, no admin login available (same standing limitation
as everywhere else in this file): reproduced the exact reported stacking scenario directly — mounted
a fake "post editor" using the real `../ui-core` Modal's own CSS classes and z-index
(`.modal-backdrop`/`.modal`, 11000/11001) wrapping a real `useConfirm()` call, matching
`closeEditing`'s actual shape. Clicked its "X": confirmed via `document.elementFromPoint()` at the
real confirm dialog's own on-screen center that the topmost element hit is now the confirm dialog
itself (`hitElementIsInsideDialog: true`, showing the actual "This post has unsaved changes..." text)
— before this fix, that same coordinate would have resolved to the fake editor's own backdrop
instead, exactly reproducing "clicking looks like it does nothing." Clicked the real "Discard"
button inside the now-reachable dialog and confirmed the editor genuinely closed
(`editorClosed: true`, dialog unmounted) — the full click path works end-to-end, not just the
z-index in isolation. Screenshotted the visible, on-top confirm dialog too. Both files parse clean.
**Not verified**: the Escape-key path specifically (the click path was verified directly, and the
Escape bug shares the identical root cause per the research agent's trace — both `onClose` triggers
in `../ui-core`'s `Modal` call the same `closeEditing`, so the same z-index fix resolves both by
construction — but Escape wasn't independently exercised through a live keydown event), and an
actual click-through by a real logged-in admin — same standing limitation as every entry in this
file. Worth a real click-through on staging: open a post, make an edit, wait for (or fake) the
session-expiry banner, then confirm "X" now shows a real, clickable "Discard changes?" prompt.

## Fourth platform added: X (Twitter) (2026-08-23)

Direct request, with scope confirmed via `AskUserQuestion` before writing any code: "full parity
with Facebook/Instagram" for the feature set (randomization, dark mode, realistic-surroundings
rails, CSV export columns), app key `x` (not `twitter`, though both are accepted aliases
everywhere `?app=` is parsed, matching Amazon's existing `amz`/`amazon`/`reviews` alias
precedent). This is a genuinely new platform, not a per-post-type variant — every one of this
file's documented "near-duplicate-`App-*.jsx`" footguns applies to it too; this section is written
in enough detail to be the reference for keeping X in sync with FB/IG/AMZ going forward, the same
way this file already serves that role for the other three.

**Scope, stated plainly up front**: "full parity" was interpreted as *the same underlying
features*, not a literal line-for-line clone of every visual/interaction detail Facebook has
accumulated over dozens of sessions (multi-emoji reaction picker + animated glyphs, bio-hover
cards, community-note/label interventions, ad+news-link-preview variants, image carousels, mobile
bottom sheets). X's actual engagement model is simpler than Facebook's to begin with (reply/
repost/like/view/bookmark, not seven reaction types), so most of that complexity doesn't have a
real X equivalent to build in the first place. What *is* built: a fully working, real feed and
post card matching X's actual visual/interaction model, admin post editor + live preview, avatar/
name/time randomization, dark mode, realistic-engagement-counts + realistic-pacing +
realistic-surroundings-rails (X's own left-nav/Trending/Who-to-follow, not a Facebook reskin),
repost/bookmark/reply(with a real reply modal)/share, and full CSV/interaction-tracking wiring.
Deliberately **not** built this pass (flagged explicitly, not silently dropped): a "recall"
post-reminder variant, community-note-style interventions, ad domain/headline/CTA fields beyond a
plain "Promoted" label, image carousels (one image *or* one video per post, no multi-image
gallery), fabricated ghost-reply-row content for the realistic-engagement toggle (X gets one
combined `realistic_engagement` flag covering reply/repost/like fallback counts, not FB/IG's
separate `realistic_engagement_comments` sub-toggle — excluded from X's admin toggle list rather
than shown as a dead switch), and any dedicated `utils-survey-simulate.js` tuning (X posts fall
through that file's generic default branch, same as a plain post would, rather than getting
X-specific simulated-reply/repost/like generation).

**Backend**: `feeds.app` was the *only* hard schema constraint restricting app values to `('fb',
'ig', 'amz')` (`20260801000003_projects_and_feeds.sql`) — `posts`/`surveys` don't store their own
`app` column, they derive scoping from the feed_id they belong to
(`<project>::<app>::<feed>`), so this was the only migration needed. New
`20260801000026_add_x_app_value.sql` (`alter table feeds drop constraint feeds_app_check; ...add
constraint ... check (app in ('fb','ig','amz','x'))`) — purely additive, mirrors the exact
precedent in `20260801000014_fix_ad_type_check.sql`. Applied directly via `supabase db query
--linked -f` to **both** live Supabase projects, production (`yrzqnlhbawzuzlrrocfd`) and staging
(`hgctbgunlsesygzglbdv`), confirmed via `pg_get_constraintdef` on each before relinking back to
production (this repo's default). No GAS/Code.gs change made or needed — GAS isn't live in
production for anything post-migration, same posture as every Supabase-only feature since the
cutover.

**Bootstrap wiring** (the mechanism every other file below depends on): `index.html`'s inline
bootstrap script gained `x`/`twitter` → `import("./src/main-x.jsx")` in its `entryMap`.
`getApp()` (`utils/utils-backend.js`) and `getAppParam()` (`utils/utils-core.js`) — the two
separate alias-normalizing functions this codebase already has for exactly this purpose — both
gained `"x"`/`"twitter"` → `"x"` recognition, inserted before the final `fb` fallback so an
existing bare/unspecified `?app=` still defaults to `fb` unchanged. `ui-core/index.js` and
`ui-posts/index.js` (the two per-app dispatch barrels every `App-*.jsx` imports through) each
gained `import * as X from "./ui-core-x"` / `"./ui-posts-x"` and an `app === "x"` branch in their
dispatch ternary.

**New files, one per existing per-app file this repo already duplicates**:
- `src/main-x.jsx` / `src/App-x.jsx` — `App-x.jsx` is a literal clone of `App-facebook.jsx` (the
  most feature-complete of the three per this file's own framing), since ~99% of it — survey
  delivery, experiment groups (including feed-sequence routing), dark mode toggle, the 404-for-
  bad-feed_id page, the already-completed guard, `AdminEntry` mounting — is 100% generic and
  needed zero changes. The **only** genuinely X-specific piece is `PageWithRails` (X has no
  "shortcuts"/groups concept the way Facebook's left rail does, so its ghost/real-content
  structure is simpler: one flat nav list on the left, Trending + Who-to-follow on the right,
  reusing the identical `buildRailContacts` seeded-suggestion mechanism FB/IG already established)
  — plus the trivial per-file identity constants (`currentApp="x"`, the vestigial `?style=` MODE
  toggle, a couple of stray in-comment file-path references). `getReminderApp()` (`ui-survey.jsx`
  **and** its independent `ui-survey-mobile.jsx` copy — the exact near-duplicate-file footgun this
  section opened by warning about) previously only ever recognized `"ig"`, falling through to
  `"fb"` for anything else, including `"amz"` (a **pre-existing** gap, noted but not touched) —
  fixed to also recognize `"x"`/`"twitter"`, since without this, X's own post-reminder survey
  questions would have silently resolved reminder posts through the wrong app's feed scope.
- `src/ui-core/ui-core-x.jsx` — the small shared primitives (icons, `PostText` clamp/expand,
  `Modal`, `NamesPeek`, `neutralAvatarDataUrl`, overlays). Deliberately does **not** carry over
  `ui-core-facebook.jsx`'s own local `SurveyQuestion`/`SurveyScreen`/`SurveyScreenMobile`/
  `SurveyPrefaceFlow`/`PageScaffold` — confirmed by reading `ui-core/index.js`'s own destructured
  re-export list that none of those five are ever actually re-exported from that file (the real,
  participant-facing versions come from `ui-survey.jsx`/`ui-survey-mobile.jsx` via `export *`,
  a separate mechanism) — they're 100% dead code in every existing app's copy, so there was
  nothing to clone. `IconLike` (a heart) is X's actual primary Like glyph here, unlike Facebook
  where the heart is only the "Love" reaction and a thumb icon is primary. `RouteAwareTopbar`/
  `TopRailPlaceholder` are deliberately near-empty (return `null` for the visible bar) — real X
  has no page-wide top bar the way Facebook does; the logo/nav/search all live in the rails
  themselves (`PageWithRails`, above). Still keeps the `admin-mode` body-class side effect and the
  admin "back to feed" FAB link, which are genuinely needed regardless of rail content.
- `src/ui-posts/ui-posts-x.jsx` — `PostCard` + `Feed`, plus the exports `App-x.jsx`'s
  `PageWithRails` imports directly (`buildRailContacts`, `LEFT_RAIL_NAV_ITEMS`, `LEFT_RAIL_ICONS`,
  `TRENDING_TOPICS`) — same "both realistic-surroundings renderers must share one generator so
  they can't drift apart" reasoning this file already documents for Facebook. `PostCard` supports:
  avatar/name/time randomization via the same externally-computed `assignedAuthor`/
  `assignedAvatarUrl` props `Feed` builds centrally (Facebook's model, not Instagram's
  self-contained one — simpler to reuse given `Feed` already centralizes the assignment maps);
  `alwaysExpandText`/`disabled`/`suppressDisplayedSnapshot`/`revealIndex` — the exact same prop
  contract every other `PostCard` honors for post-reminder-question and pacing compatibility, so
  those features "just work" without any reminder-specific code in this file; a "displayed post
  snapshot" write on mount, mirroring Facebook/Instagram/Amazon's identical mechanism, so a
  post-reminder question later shows the exact randomized version a participant actually saw.
  Reply/Repost/Like/Bookmark/Share all route through the *existing*, already-generic
  `applyPostInteractionEvent`/`makeEmptyPostInteractionAggregate` reducer in `utils-core.js`
  (`react_pick`/`react_clear` with `type:"like"`, `repost`/`unrepost`, `save`/`unsave`,
  `comment_submit`, `share`) — **zero changes were needed there**, since Instagram's own earlier
  Repost feature had already generalized that reducer far enough for X to reuse directly. Reply
  opens a real `Modal`-based composer (original post shown, submitted replies appended below,
  `comment_submit` fired with the real text) — deliberately simpler than Facebook's comment modal
  (no friend-list/threaded-reply machinery), since X's own reply UI doesn't need that either.
  Share opens a small "Copy link" / "Repost" menu rather than Facebook's full share-to-friend
  modal. View count is **display-only** (not a participant action) — sourced from an admin-
  authored `view_count` field or, when `realistic_engagement` is on, derived deterministically
  from the same `fallbackEngagementStats` numbers already used for reply/repost/like (no new
  hash/PRNG needed).
- `src/styles-x.css` — cloned from `styles-facebook.css` (inheriting all the generic, already-
  debugged scaffolding this file documents fixing over many sessions: the survey engine's CSS,
  modal/ghost-skeleton/admin-mode/dark-mode-token-bridge machinery, the click-interception and
  double-ellipsis fixes) with two real, deliberate changes: the root `:root`/`.dark-mode` token
  *values* rebranded to X's actual palette (light: white/near-black `#0f1419`/blue `#1d9bf0`; dark:
  literally pure black `#000`, not a dark grey the way Facebook/Instagram's dark modes are — this
  matches X's real default "Lights out" theme, and posts are separated by a line only, no boxed-
  card look), plus a new `.x-*` section for the post card/action-row/reply-modal markup, which is
  structurally different enough from Facebook's boxed `.card` look (a flat, divider-separated list,
  no per-post box/shadow) that it needed its own classes rather than reusing `.card`/`.action`.
  **Known, accepted gap**: a handful of Facebook-only rules cloned along with the file (reaction-
  flyout, bio-hover, intervention-block, ad/news-link-preview CSS) are now dead weight in this
  file, since X's markup never uses those classes — left in rather than risking removing something
  still-generic by mistake under time pressure; a real (if low-priority) cleanup candidate for a
  future pass, not something silently swept under the rug.
- `src/admin/components-admin-editor-x.jsx` / `components-admin-media-x.jsx` — the admin post
  editor + its media fieldset. `components-admin-media-x.jsx` is a **byte-for-byte copy** of
  `components-admin-media-facebook.jsx` — confirmed via grep that file has zero "Facebook"-specific
  text or logic in it at all (image-mode/video-mode/upload/poster fields, all fully generic), so
  there was nothing to adapt. The editor itself mirrors the FB/IG/AMZ editors' shape (a "🎲 Fill
  with random content" button for new posts, `EditorSection`/`Field`/`Group`/`RadioGroup`/
  `Toggle`/`PreviewPane` shared primitives, a live `PreviewPane` rendering the real `PostCard`)
  but with a leaner field set matching X's simpler model: Basics (post name for CSV, display name,
  handle, verified toggle, time, author type, post text), Profile Photo (identical avatar-mode
  picker to FB), Post Media (the reused fieldset), Post type (Regular / Promoted — no ad-domain/
  headline/CTA sub-fields), Engagement counts (reply/repost/like/view, four plain number fields).

**Wiring into the existing three-app machinery**: `AdminPlatformPicker.jsx` gained a 4th
`PLATFORMS` entry (`{app:"x", label:"X", icon: IconX, blurb:...}`) — a new `IconX` glyph added to
the shared `src/admin/ui/icons.jsx`/`ui/index.js` icon set (a literal geometric "X" mark, not a
redrawing of any bird logo). `components-admin-dashboard.jsx`'s per-app dispatch constants
(`AdminPostEditor`, `genNeutralAvatarDataUrl`, `APP_LABEL`, `DASHBOARD_TITLE`) gained an `isX`
branch — computed as `app === "x" || app === "twitter"`, mirroring this exact file's own existing
`amz`/`amazon` alias-handling precedent, since this file computes its own local `app` constant
directly from the raw `?app=` param rather than reusing the shared alias-normalizing `getApp()`.
`components-admin-feeds.jsx`'s Feeds → Settings → Behavior toggle list (previously only had an
Amazon-specific whitelist-when-amz filter) gained a parallel X-specific exclusion (`bio`,
`engagementComments` — the two flags with no real X implementation, see the "deliberately not
built" list above) so the admin never sees a toggle that would silently do nothing.
`buildParticipantRow`/`isRelevantPostMetricForExport` (`utils-core.js`/`utils-backend.js`) had a
hard `APP === "ig"` gate on the `_saved`/`_reposted` CSV columns (Save/Repost being IG-only
concepts before this) — widened to `APP === "ig" || APP === "x"` in both places, since Bookmark/
Repost are equally real, first-class actions on X. `POST_METRIC_SUFFIXES_FOR_LABELS` already
included both suffixes app-agnostically, so no change was needed there.
`REMINDER_INTERACTION_FIELDS` (the curated CSV columns for an *interactive* post_reminder
question) already includes `reposted` unconditionally, so X's interactive reminders pick that up
for free with no change. Two small, genuinely cosmetic gaps found and fixed while auditing this:
the PDF-export template and the Feeds table's author-name cell both checked `post.badge` for a
verified checkmark (Facebook/Instagram/Amazon's field name) with no `post.verified` fallback (X's
own field name) — widened both to `(post.badge || post.verified)`.

**Verified live**, throughout, via the dev server (confirmed working in this environment) and the
cache-busted dynamic-import component-mount technique this file already documents using
repeatedly — not just read for plausibility:
- The real `Feed`/`PostCard` (via `ui-posts/index.js`, exactly the path a real participant page
  uses) mounted with fabricated posts: verified badge, name+handle+time, text clamp/"Show more"/
  "Show less", image attachment, and the full action row (reply/repost/like/views/bookmark/share)
  all render correctly with the right counts. Clicked through every interactive action for real:
  Like toggles the heart red and increments the count; Repost turns the icon green and increments;
  the Reply modal opens, shows the real original post, accepts and submits a reply (confirmed the
  real `comment_submit` action fired with the correct `{post_id, text, length}` payload and the
  reply-count badge updated), and closes cleanly; the Share menu opens with "Copy link"/"(Undo)
  repost" (label correctly reflecting current repost state) and "Copy link" fires the real `share`
  action; Bookmark toggles active/blue. Toggled `body.classList.add("dark-mode")` on the same live
  mount and confirmed pure-black background, correctly-recolored share menu, and all prior toggle
  states (liked/reposted/bookmarked) survived the theme switch unchanged.
- `realistic_surroundings`/`realistic_pacing` together: confirmed via direct DOM query (not just a
  screenshot) that both rails render as `rail--content` (not the ghost skeleton), the left rail
  shows exactly the 11 `LEFT_RAIL_NAV_ITEMS` entries, the right rail shows exactly the 4
  `TRENDING_TOPICS` entries plus seeded Who-to-follow suggestions, and both rendered posts carry
  the `post-reveal-in` pacing class.
- The admin `AdminPostEditor` (X), mounted with the real `ToastProvider` and a fabricated post:
  every Basics/Profile-Photo/Media/Post-type/Engagement-counts field renders and the live
  `PreviewPane` (labeled "X") shows the real `PostCard` reflecting live edits, including a real
  avatar photo resolved through `randomAvatarByKind`.
- `AdminPlatformPicker`, mounted with a real `MemoryRouter`: all 4 platforms render in order,
  X's row shows the correct icon/label/blurb, and `currentApp="x"` correctly shows "(currently
  loaded)" only on X's own row.
- **Regression check**: reloaded `?app=fb`, `?app=ig`, `?app=amz`, and `/admin?app=x` (the admin
  login page) fresh — all four load with zero console errors, confirming none of the shared-file
  changes (the two dispatch barrels, `utils-core.js`, `utils-backend.js`,
  `components-admin-dashboard.jsx`, `components-admin-feeds.jsx`, `ui-survey.jsx`/
  `-mobile.jsx`, `AdminPlatformPicker.jsx`, the shared icon set) broke any of the three pre-existing
  apps.

**Not verified**: an actual click-through by a real logged-in admin (standing limitation
throughout this file — credential entry is off-limits) — the admin editor/platform-picker checks
above used direct component mounts with a fabricated `ToastProvider`/`MemoryRouter` context, not a
real authenticated session driving the actual routed `/admin/*` UI. No real backend round-trip was
exercised either (creating a real X feed/post via the admin UI and loading it back through a real
participant link) — every check above was against fabricated in-memory data. Worth doing both on
staging before fully trusting this beyond what the live-mounted-component verification already
covers, same recommendation this file already makes for every other multi-file feature.

**Deployment status, stated plainly since it matters here more than usual**: this session's
working tree was sitting on the **`production` branch** (not `main`) when this work was done —
per this file's own "Deployment" section, `production` is what GitHub Actions deploys straight to
`studyfeed.org`, with no Netlify-staging soak step in between the way `main` gets. Nothing was
committed or pushed by Claude (this repo's standing pattern — commits/pushes happen via the user's
own GitHub Desktop app, not from Claude's sandbox), but if that app's auto-commit fires on this
working tree before the user has had a chance to review, this fourth-platform work — including a
schema change already live on both Supabase projects — would go straight to production with no
staging buffer at all, unlike how every other multi-file feature in this file's history landed.
Worth deliberately routing this through `main` → staging first before it reaches `production`,
given it's a first draft of an entirely new participant-facing surface, not an iteration on an
already-battle-tested one.

## Two real bugs found the same day, via a genuine backend round-trip test (2026-08-23)

Direct report: "none of the feed toggles work in the X environment." Investigated by finally doing
what the previous entry's own verification section admitted it hadn't done — a real read/write
round trip through the actual Supabase mapping layer, not a component mount with hand-built
in-memory objects (which is all the previous entry's "verified live" section actually covered).
Two distinct real bugs surfaced this way, neither of which a pure component-render test could ever
have caught.

**Bug 1 — X posts' `handle`/`verified`/engagement counts were silently dropped on every save and
load.** `posts` (`20260801000004_posts.sql`) was designed entirely around Facebook/Instagram/
Amazon's field set — its own header comment says so explicitly ("Field list taken directly from
makeRandomPost()... Facebook has the largest field set"), written before X existed.
`mapPostRowToRaw`/`mapRawPostToRow` (`utils-backend-supabase.js`) are a fixed allowlist mapping
specific DB columns to specific JS field names — neither one had ever heard of `handle`/`verified`/
`like_count`/`reply_count`/`repost_count`/`view_count`, the six fields X's own admin editor
(`components-admin-editor-x.jsx`) reads and writes on the post object. Confirmed live: mounted the
real `App-x.jsx` end-to-end (not just `Feed`/`PostCard` in isolation) with `window.fetch` patched
to serve a fabricated `posts` row shaped exactly like a real Supabase row, and watched the display
name render correctly (`author` was already in the old allowlist) while handle/verified/text/counts
all came back blank — the exact "looks fine in an isolated component test, silently broken through
the real data path" gap this file's own postmortems (the `posts.id` collision incident, the
`normalizeFlags` incident) already warn about, repeating itself for a fourth platform.

Fixed with a new migration, **`20260801000027_add_x_post_fields.sql`** — `handle text` and
`verified boolean not null default false` as two new dedicated columns (purely additive, applied to
both Supabase projects, confirmed via `information_schema.columns` on each before relinking back to
production). The four engagement counts deliberately did **not** get four more dedicated columns —
folded into the *existing* generic `metrics` jsonb column instead (`metrics.likes`/`.replies`/
`.reposts`/`.views`, alongside Facebook's own `metrics.comments`/`.shares` in that same column, no
collision risk since one post row belongs to exactly one app's feed) — no schema change needed for
those four at all. `mapPostRowToRaw`/`mapRawPostToRow` both updated to read/write all six fields;
the write side merges into `metrics` (spreads the existing object forward, only overwrites the keys
actually present in `raw`) rather than replacing it outright, so a future field someone else adds to
`metrics` can't get silently clobbered by this addition.

**Bug 2 — every single feed-flag toggle failed on a feed that had never been published, for every
app, not just X.** `supabaseSetFeedFlags` (the one function every one of `toggleFlag`'s ~12 toggles
routes through — time/avatar/image/name/bio/engagement/pacing/surroundings/dark/etc., literally
all of them) did a plain `.update({flags: merged}).eq("id", composedFeedId).select("flags").single()`
— PostgREST's `.single()` modifier requires *exactly* one matching row, and throws when zero rows
match. "+ New feed" in the admin UI is pure client-state until the first publish (`savePostsToBackend`
is what actually inserts the `feeds` row) — so a brand-new, never-yet-published feed genuinely has
no row in `feeds` yet, and every flag toggle attempt against it fails outright, visually reverting
(the toggle's own busy-state `finally` block resets it back to unset once the thrown error is
caught). **This is not an X-specific bug at all** — the identical failure would hit a brand-new
Facebook/Instagram/Amazon feed too — it surfaced now purely because every X feed anyone has tried is,
by definition, brand new, and the natural first thing to try on a new platform is toggling its
settings before necessarily publishing posts to it first.

Confirmed directly against the live database (not assumed from reading the client-library docs):
ran the equivalent raw SQL (`update feeds set flags=... where id='<nonexistent>' returning flags`)
against a genuinely nonexistent feed id under a disposable `zzclaudetest_proj` test project —
returned zero rows, exactly the condition that makes `.single()` throw. Fixed by switching to
`upsert(..., {onConflict: "id"})`, providing every column a first-time insert needs
(`id`/`feed_id`/`project_id`/`app`/`name`/`flags` — `feed_id` is a real, separate, not-null column
from the composed `id`, confirmed against the live `information_schema.columns` after an earlier
version of this exact fix omitted it and hit a not-null violation on the insert branch specifically;
an update-only path on an *existing* row never needed it, since it's already set there, which is
exactly why this was easy to miss). `name` falls back to the bare `feedId` only when genuinely
creating a new row — an existing feed's real name (read via the same initial `select` this function
already did) is always preserved, never overwritten by a later flag toggle.

**Verified against the live production database, read-only where possible, cleaned up where not**:
reproduced the exact `.update().single()` failure mode via raw SQL against a disposable project/
feed-id combination; then verified the *fixed* upsert shape two ways — first-time creation (zero
existing rows → correct single-row upsert with the fallback name and the toggled flag set), and a
simulated second toggle against the now-existing row (flags merge correctly, cumulative with the
first toggle, and the real name — deliberately changed via direct SQL first, standing in for
whatever the admin later renamed the feed to — survives untouched). Deleted the disposable project/
feed afterward, confirmed zero rows left. This fix is pure application code (`utils-backend-
supabase.js`), not a schema change — nothing further needed applying to either Supabase project
beyond the `posts` migration in Bug 1 above.

**Not verified**: an actual click-through by a real logged-in admin toggling a flag on a real,
never-published X feed through the live `/admin/*` UI — same standing no-login limitation as
everywhere else in this file. The database-level reproduction above is a direct, mechanical proof of
the exact failure PostgREST would produce, not a substitute for watching the real click succeed, but
it's about as close as this sandbox can get without real admin credentials.

## The actual root cause: `getApp()` had no fallback once the URL lost its `?app=` param — a real, pre-existing bug, not new to X (2026-08-23, later same day)

The two fixes above genuinely were real bugs, but neither explained what the user reported next:
"FB feeds are now also on my X platform and if i preview them they show as X, but i still can't
toggle any of the feed toggles." That symptom — the *displayed feed list* being Facebook's real
feeds while the *rendered UI chrome* is unmistakably X — pointed at something deeper: two different
parts of the app disagreeing about which platform is currently active.

**Root cause, confirmed by reproducing the exact mechanism, not guessed**: `getApp()`
(`utils-backend.js`) resolves the current platform fresh on every call — first from the live
`?app=` URL query param, then from `window.APP`, then a hardcoded final fallback of `"fb"`. Unlike
`getProjectId()` (`utils-core.js`), which persists to `localStorage` and falls back to it, `getApp()`
has **no persistence at all** — if a given moment's URL genuinely has no `?app=` in it, and
`window.APP` was never set, it silently reports `"fb"`, correct or not.

`AdminPlatformPicker.jsx`'s `pick(app)` has a branch specifically for "you clicked the platform
that's already loaded" (`if (app === currentApp) { navigate("/admin/dashboard"); return; }`) — a
bare, absolute-path client-side `navigate()` call, which replaces the *entire* URL, search string
included, with just `/admin/dashboard`. The moment that fires, `?app=x` (and `?project=...`) are
gone from the address bar for the rest of the session. `getProjectId()` survives this because of its
`localStorage` fallback; `getApp()` does not.

The reason this had never surfaced for Facebook, Instagram, or Amazon: `main-instagram.jsx` and
`main-amazon.jsx` both already set `window.APP = "ig"` / `"amz"` at bundle load — a real fallback
that survives exactly this kind of URL loss. **`main-facebook.jsx` never did this, and neither did
the new `main-x.jsx`** (cloned from it). For Facebook specifically, this was invisible for a
different reason: `"fb"` is *also* `getApp()`'s hardcoded final fallback, so losing all real signal
and silently defaulting to `"fb"` happened to look identical to correctly being on Facebook — the
bug and the fallback answer were the same value, by coincidence, for that one app. X was the first
non-default platform lacking this safety net, which is exactly why it's the one where the effect
became visible: everywhere that calls `getApp()` live (`listFeedsFromBackend`, every
`setFeedFlagsOnBackend` call inside `toggleFlag`, etc.) started silently reading/writing **Facebook's**
feeds under a project, the instant the URL lost `?app=x` — while the dashboard's own visual chrome
(`AdminPostEditor`, `APP_LABEL`, etc.) stayed correctly "X," since those are gated by a *different*,
module-load-time-frozen `app` constant in `components-admin-dashboard.jsx` that was captured
correctly at the very first full-page navigation and never re-read afterward. Two different parts
of the same page silently disagreeing about "which platform is this" is exactly what produced "the
feed list shows my Facebook feeds, but the preview still renders as X."

**Fix**: added `window.APP = "fb"` to `main-facebook.jsx` and `window.APP = "x"` to `main-x.jsx`,
matching the pattern Instagram/Amazon already had. This gives `getApp()` a real, URL-independent
fallback for all four platforms uniformly, closing the gap regardless of what any future client-side
route change does to the query string.

**Verified directly**, not assumed: loaded the real page fresh under `?app=x`, confirmed
`window.APP` was genuinely set to `"x"` by the real bootstrap script (not a manual test mount), then
reproduced the *exact* buggy transition — `history.pushState` to `/admin/dashboard` with no query
string at all, precisely mirroring `AdminPlatformPicker`'s own `navigate()` call — and confirmed
`getApp()` still correctly returned `"x"` afterward (before this fix, this exact sequence would have
returned `"fb"`). Repeated the same test under `?app=fb` as a regression check — `window.APP`
correctly `"fb"`, `getApp()` stays `"fb"` through the same URL-loss sequence, no change in behavior
for the one platform that already "looked" correct by coincidence.

**Not verified**: an actual click-through by a real logged-in admin reproducing the original
report (open the X dashboard, navigate somewhere that drops `?app=`, confirm the feed list and
toggles now correctly stay scoped to X) — same standing no-login limitation as everywhere in this
file. The URL-loss mechanism itself was reproduced directly and precisely, which is the load-bearing
part; the remaining gap is only "does a real admin session confirm the same fix end to end."

## Safari-only "..." post-menu click sometimes not registering, all four apps (2026-08-26)

Direct report: on `studyfeed.org`, in Safari specifically, tapping the "…" post-menu button
sometimes silently does nothing — inconsistent per-post ("for some posts it does work"), not
reproducible in this sandbox's Chromium-based browser tooling. Investigated live against the real
production feed (`?feed=feed_6&project=proj_6&app=fb`, a real UWA/USC-ethics-approved study —
walked through consent/instructions read-only, no submission) plus the git history of every recent
commit touching feed rendering, to rule out a known/regressed z-index or pointer-events bug before
reaching for a browser-engine-specific explanation.

**Ruled out first**: the already-documented `.top-rail-placeholder` `pointer-events:none` fix
(2026-08-08, "the post '…' menu not opening near the top of the page") is still correctly in place
and untouched by any recent commit; a direct `elementFromPoint()` sweep against every real "…"
button on the live feed (all 10 loaded posts, correct scroll position via `document.body.scrollTop`
— the actual scroll container here, confirmed via a scrollable-ancestor chain walk) found zero
interception in Chromium. None of the six most recent, previously-undocumented commits
(`5db4b36`…`601fae8`) touch feed rendering at all — all survey-editor/CLAUDE.md/X-platform-docs
work, ruling out a recent regression as the direct cause.

**Working hypothesis, evidence-based but not provably confirmed (no real Safari available in this
sandbox)**: the real feed being tested has `realistic_pacing` on — confirmed live, every post
`<article>` carries `post-reveal-in` (the staggered entrance-fade CSS animation, see "New: realism
improvements" 2026-08-08 above). That animation's `transform`/`opacity` keyframes stay *declared*
on the element indefinitely (`animation-fill-mode: backwards` only reverts the *computed* values
once finished, per that entry's own reasoning — it never removes the `animation` property itself).
This is exactly the shape of a well-documented WebKit bug class: an element that has ever run a
`transform`-involving CSS animation can retain a stale compositor/hit-test layer in Safari
specifically, causing touches on its descendants (here, the "…" button sitting in the post header)
to intermittently miss — inconsistent by nature, matching "sometimes, for some posts" precisely.
This is a second, distinct consequence of the same animation the `both`→`backwards` fill-mode fix
already addressed once before (that fix solved a fixed-position-containing-block bug; this is a
separate compositor/hit-testing risk from the same root cause, unique to Safari).

**Fix, mirrored identically across all four apps** (the same near-duplicate-file shape this
document already warns about for `post-reveal-in`/`revealIndex`) — `ui-posts-{facebook,instagram,
amazon,x}.jsx`: each post's root element now tracks a `revealDone` state (`useState(revealIndex ==
null)`), gains an `onAnimationEnd` handler (guarded with `e.target === e.currentTarget` so a bubbled
event from an unrelated child animation — reaction wobble, ghost shimmer — can't trigger it early)
that flips `revealDone` true, and the `post-reveal-in` class + its `animationDelay` inline style are
now only applied while `revealIndex != null && !revealDone` — so once the animation genuinely
finishes, the class (and the `animation` declaration with it) is fully removed from the element,
letting the browser release whatever compositor layer it was holding. No visual change: the CSS
animation's final keyframe (`opacity:1; transform:translateY(0)`) is identical to the plain,
class-removed computed style, so the removal is a no-op paint-wise. Elements that never animate
(revealIndex null, or `prefers-reduced-motion: reduce`, where `.post-reveal-in{animation:none}`
already applies) are unaffected — `revealDone` just never becomes relevant for them.

**Verified**: all four files parse clean (`@babel/parser`). Live-mounted the real `Feed`
(`ui-posts-facebook.jsx`, via a cache-busted dynamic import of the actual module against the local
dev server, not a reimplementation) with `flags:{realistic_pacing:true}` and two fabricated posts —
confirmed the initial render carries `post-reveal-in` with the correct staggered `animation-delay`
(0ms/70ms), and ~600ms later (animation + longest stagger has elapsed) confirmed via
`getComputedStyle`/`elementFromPoint` that the class and inline style are both fully gone and the
"…" button still resolves correctly to itself at that exact position — then clicked it for real and
confirmed `aria-expanded` flips to `"true"`, proving the fix doesn't interfere with the actual menu
toggle. **Not verified**: this in real Safari (no such engine available in this sandbox) — the
fix is a well-reasoned, standard mitigation for the specific WebKit bug class the symptom matches,
verified correct and non-regressing at the code level, but not proven to be the exact mechanism
Safari hits. Worth confirming directly in Safari (Mac or iOS) once deployed, and worth knowing this
working tree was on the `production` branch when this was written — unlike most sessions in this
file, there is no `main`→staging soak before this reaches `studyfeed.org` unless it's deliberately
routed through `main` first.

## Correction to the entry above: `post-reveal-in` was NOT the cause — investigation continues (2026-08-26, later)

Direct pushback from the user, correctly: "this issue is completely independent from the pacing,"
and separately, "even with the pacing on, I don't see any pacing at all." Both points taken at face
value rather than argued with — the `post-reveal-in`-as-root-cause entry directly above this one
should be read as a **ruled-out hypothesis**, not a confirmed fix. The `revealDone` class-cleanup
change itself was left in (harmless — it can't cause a visual regression, since the class is only
ever removed once the animation's own final frame is already the element's plain computed style)
but it should not be credited with fixing the reported "…" menu bug.

**Re-investigated from scratch, independent of pacing, against the real live production feed**
(`feed_6`/`proj_6`, real UWA/USC-ethics study — read-only, no submission) — this time at **both**
mobile (375px) and genuine desktop (1280px) width, being careful to navigate fresh at each width
rather than resize an already-loaded tab (a real testing-methodology trap hit along the way: this
sandbox's viewport-resize tool doesn't reliably re-fire the `matchMedia` "change" listener
`useIsMobile()` depends on, so resizing a live tab can leave stale mobile/desktop state — reloading
fresh at the target width is required for this specific hook to actually reflect it).

- **Zero click-interception found in either width**, via a precise `elementFromPoint()` sweep
  against every real "…" button on the loaded feed, deliberately scrolling each one to sit exactly
  inside the sticky top bar's 0–53px band (the exact scenario the original 2026-08-08 top-bar-
  pointer-events fix targeted) — every single button still resolved correctly to itself. The
  earlier fix (`.top-rail-placeholder{pointer-events:none}`) is confirmed present and doing its job,
  at least in this Chromium-based tooling.
- **A real, verified (not guessed) structural quirk found along the way, flagged as worth knowing
  even though not yet tied to the bug**: `body{overflow-x:hidden}` (two places, `styles-facebook.css`
  ~line 61 and ~1460) combined with `html,body,#root{height:100%}` causes `<body>`'s computed
  `overflow-y` to resolve to `auto` (a real CSS Overflow spec rule: setting only one axis away from
  `visible` computes the other axis to `auto`, confirmed empirically via `getComputedStyle` on the
  live page, not just read from spec text) — meaning **`<body>` itself, not `<html>`/the normal
  document viewport, is this page's actual scrolling element** (confirmed:
  `document.scrollingElement`-equivalent behavior — `document.body.scrollTop` moves the page,
  `window.scrollY` does not). This is an atypical page-scrolling setup; Safari (especially iOS) is
  known to sometimes handle non-viewport scroll containers, and `position:sticky` children of them,
  less predictably than the normal window-scrolling case. **Not confirmed as the cause of the "…"
  bug** — flagging it as the most concrete lead left after ruling out the animation and the z-index/
  pointer-events overlap, worth a deliberate look (or a real-Safari test) before touching it, since
  changing how the page scrolls is a much bigger, riskier change than anything else tried so far and
  other code in this app (scroll-tracking, dwell timers) may already assume this exact behavior.

**Genuinely blocked without more specific reproduction info or actual Safari access** (this sandbox
has no Safari, only a Chromium-based browser tool) — asked the user directly: does it reproduce on
one *specific* post consistently (which one, so the two DOM trees can be diffed), which Safari
(macOS vs iOS, and roughly which version), and whether it happens on a fresh page load or only after
scrolling. Whoever picks this up next should treat the `post-reveal-in`/pacing angle as closed and
start from the body-scroll-container observation or a fresh angle instead.

## Post editor: live preview dark-mode gap fixed, "Basics" split into three sections (2026-08-26, later)

Two direct-feedback items on the admin post editor, unrelated to the Safari "…" investigation above.

**Live preview stayed light for action buttons in dark mode.** Root cause: `PreviewPane`
(`components-admin-editor-ui.jsx`, shared by all 5 post editors) never toggled the participant-
facing `.dark-mode` class anywhere — confirmed via grep, zero references. The preview's *surface*
colors happened to already look dark-appropriate anyway, because `tokens.css` bridges the generic
`--card`/`--text`/`--bg`/etc. custom properties to `--admin-*` ones inside `.admin-shell` (so
anything using `var(--card)`/`var(--text)` picks up the admin theme automatically) — but
`.action`/`.dots` and the comment/share modal chrome hardcode their own light colors
unconditionally in the base rule, with the actual dark styling gated behind a real `.dark-mode`
class further up the tree (`.dark-mode .action{...}`, etc. — see the several "Dark mode" rounds
earlier in this file). Since that class was never added, those specific elements stayed stuck
light regardless of admin theme — exactly the reported symptom ("some buttons are still light,
e.g. share, comment").

**Fix**: mirrors the exact pattern `components-admin-feed-preview.jsx`/
`components-admin-survey-preview.jsx` already established — `PreviewPane` now calls
`useAdminTheme()` and toggles `document.body.classList.add("dark-mode")` for as long as it's
mounted (cleanup on unmount), same as those two files' own comment about needing `body`
specifically (not just a wrapper div) since comment/share content portals straight to
`document.body`. One shared fix point (`PreviewPane` itself) covers all 5 editors — Amazon and
Instagram's media fieldsets don't need a separate change.

**Verified live** via a real mounted `AdminPostEditor` (Facebook) wrapped in the real
`ToastProvider`, with `admin_theme_v1` toggled in `localStorage` (the actual key `useAdminTheme`
reads — an earlier test attempt that mutated the `data-admin-theme` DOM attribute directly instead
was overwritten by the hook's own effect on the next render, a test-harness mistake, not an app
bug): dark admin theme → `.action` (Like/Comment/Share) read `rgb(232,234,237)` on
`rgb(26,29,36)` (was `rgb(17,24,39)` on `rgb(255,255,255)` before the fix); light admin theme →
unchanged from before (regression-checked); unmounting the editor correctly removed
`body.dark-mode`. Also opened the mobile comment sheet (this preview renders at a narrow width,
so `FacebookCommentSheetMobile` is what's actually reachable, not the desktop modal) and confirmed
its portaled-to-`document.body` panel picked up the real participant dark surface color
(`rgb(36,37,38)`, i.e. `#242526`) correctly, confirming the body-level toggle (not a wrapper class)
was the right call. **Not verified**: the desktop comment/share modal specifically, or an actual
click-through by a real logged-in admin — same standing limitation as everywhere else in this file.

**"Basics" section split into three** (`Basics` / `Author` / `Post content`), applied identically
to Facebook, Instagram, and X's editors (Amazon's was already split into `Review identity`/
`Review metadata`/`Participant actions` — not touched, not the one being complained about):
- **Basics** — just the "🎲 Fill with random content" button + "Post name (for CSV)" (pure
  admin/export metadata, not participant-visible content).
- **Author** — Author name (+ Handle, X only), Author Type radio, Verification badge toggle.
- **Post content** — Time, Topic (FB/IG only, X has no topic field), Post text.

All three still default collapsed (no `defaultOpen` passed), matching this file's existing
"every section starts collapsed" convention. The Verification-badge+Time pairing that used to sit
side by side in one `grid-2` row is now split across two different sections (Verification → Author,
Time → Post content) — an intentional layout tradeoff, not an oversight. Every `value`/`onChange`
wire was moved verbatim, no logic changes. Verified: all four touched files parse clean
(`@babel/parser`); live-mounted `SurveyEditor`... no — live-mounted the real `AdminPostEditor`
(Facebook) and confirmed via screenshot the three cards render distinctly, each independently
collapsible, in the correct order before "Profile Photo". Instagram/X were not independently
live-mounted (same mechanical edit pattern, already covered by the parse check) — worth a quick
look if either behaves unexpectedly.

## New: "with diverse viewpoints" toggle for the Facebook Community Note intervention (2026-09-11)

New admin-configurable checkbox on the Facebook post editor's Context Note intervention type
(`components-admin-editor-facebook.jsx`) — appends "with diverse viewpoints" to the existing "The
context was rated as helpful by \<group(s)\>" sentence (`RatedByLine`,
`components-ui-interventions.jsx`), mirroring real X Community Notes' own "rated helpful by people
from different points of view" framing, as a toggle rather than requiring it to be hand-typed into
the free-text contributor-group "type" field every time. New `posts.note_diverse_viewpoints boolean
not null default false` column (`20260801000037_note_diverse_viewpoints.sql`), purely additive —
every existing post's rendered sentence is unchanged until an admin explicitly turns it on.

**Not independently verified by this session** — reconstructed from the commit diff (`8b87b1e`),
not live-tested here; picked up while catching this file up on a run of undocumented commits (see
"CLAUDE.md catch-up" near the end of this file for the full list and context).

## Power analysis: factorial-ANOVA interaction and moderated-regression interaction added (2026-09-11)

Extended the power-analysis tool (`utils-power-analysis.js`/`components-admin-power-analysis.jsx`)
with two new families beyond the existing one-way-ANOVA/t-test/correlation calculators, both
genuinely needing real noncentral-F machinery rather than the simpler chi-square stand-in the
one-way-ANOVA function gets away with (since both depend on residual/error df, not just the number
of groups):
- **Factorial ANOVA, 2-way interaction** (`sampleSizeFactorialInteraction`/
  `achievedPowerFactorialInteraction`/`minDetectableEffectFactorialInteraction`) — Cohen's f applied
  to the interaction-specific portion of variance for a balanced `levelsA × levelsB` design,
  df1 = (a−1)(b−1).
- **Interaction/added-block in moderated multiple regression**
  (`sampleSizeRegressionInteraction`/etc.) — the standard "R² increase" F-test (Cohen, 1988, ch. 9;
  matches R's `pwr.f2.test`), using Cohen's f² (a genuinely different scale from the existing f —
  new `COHEN_F2 = {small:.02, medium:.15, large:.35}` benchmarks added alongside the pre-existing
  `COHEN_F`/`COHEN_W`/`COHEN_R`).

Both are built on a from-scratch noncentral-F CDF (`noncentralFCDF`, a Poisson-mixture over
central-F terms — the same pattern `noncentralChiSquareCDF` already uses elsewhere in this file —
plus a from-scratch central-F CDF via the regularized incomplete beta function, reimplemented
locally per this file's own "deliberately self-contained" header comment rather than imported from
`utils-survey-analysis.js`, which already has an equivalent for real p-values).

**Not independently verified by this session** — reconstructed from the commit diff (`53039bb`) and
its own detailed code comments (which read as mathematically careful, citing the specific Cohen
1988 formulas used), not live-tested or numerically spot-checked here.

## New Author Type option: "Random (male or female)" — per-post gender randomization (2026-09-11)

Direct request: "Randomize avatars/names" already picks a random name+avatar *within* whichever
gender a post's Author Type is fixed to (female/male/company) — the user wanted a post whose gender
itself varies per participant (some see a random male author, others a random female author),
scoped to one specific post, not a feed-wide setting. Facebook, Instagram, and X only — Amazon has
no avatar/gendered-name concept at all (reviewer names are one ungendered pool, confirmed via code
read before starting), so it was never in scope there and its editor has no Author Type field.

**New shared helper, one implementation instead of N near-identical ternaries.** Before writing any
code, grepped every `post.authorType === "male" || post.authorType === "company" ? post.authorType
: "female"`-shaped fallback in the repo — found it duplicated **12 times** across 8 files (Feed's
own bucketing/PostCard fallback in `ui-posts-facebook.jsx`/`ui-posts-instagram.jsx`/`ui-posts-x.jsx`,
each `App-*.jsx`'s post-reminder preload + asset-preload-gating, and `ui-survey.jsx`/
`ui-survey-mobile.jsx`'s no-snapshot reminder-avatar fallback) — exactly the kind of "known
duplicated logic" footgun this file already warns about elsewhere, just not one it had a name for
yet. New `resolvePostAuthorType(post, seedParts)` (`utils-core.js`, exported) is now the single
place this resolves: male/company pass through unchanged, anything else (including missing/legacy
data) defaults to `"female"` exactly as every call site already did, and `"random"` deterministically
picks `"female"`/`"male"` via the same `pickDeterministic` primitive `buildRailContacts`'s own
gender pick already uses — seeded so **a given participant/session sees the same resolved gender
for that post every time** (stable across reloads and across live-feed vs. a later post-reminder
survey question), while different participants independently land on either gender. Callers pass
seedParts already unique per post (the same convention every other per-post deterministic pick in
this file already follows) — every one of the 12 call sites now routes through this function instead
of its own copy of the ternary, with the exact same seed shape it always used (so nothing about
*when*/*how* each spot resolves gender changed, only that "random" is now a real third case instead
of silently falling to the "female" default).

**Two of the 12 call sites are pool-cache warm-up only, not a specific pick** — the `assetPreload`
effect in each `App-*.jsx` that decides which avatar pool JSON files to prefetch. These don't call
the resolver at all (no `runSeed` needed at that point in the render, and no downstream correctness
risk either way): if any post has `authorType === "random"`, both the female and male pools are
added to the warm-up set unconditionally — safe over-fetching (a cached-but-unused pool list is
harmless) rather than needing exact per-post resolution just to decide what to prefetch.

**Consistency between the live feed and a post-reminder survey question, verified by tracing the
seed values, not assumed.** When a participant has actually viewed a post live, `PostCard`'s
"displayed post snapshot" mechanism already bakes the *resolved* `author`/`avatarUrl` into the
stored snapshot (confirmed by reading `displayedSnapshot`'s construction — `snapshot.author =
displayAuthor`, not `post.authorType`) — a later reminder just replays those concrete values, so
`resolvePostAuthorType` never even runs a second time for that path, no consistency risk. When
there's no snapshot (survey-only delivery, or a reminder targeting a feed the participant never
saw), the reminder's own fallback and its preload counterpart both build seedParts from
`runSeed`/`participantSeed` — confirmed these are literally the same value under two names
(`preloadSurveyPostReminders`'s own `const runSeed = participantSeed || "survey-reminder-preview"`),
so the two independently-computed resolutions are guaranteed to agree.

**DB migration**: `posts.author_type`'s check constraint only allowed `('female', 'male',
'company')` — same shape as the pre-existing `ad_type` gap this file already documents fixing once
(`20260801000014_fix_ad_type_check.sql`) — new `20260801000038_add_random_author_type.sql` widens it
to add `'random'`. `mapRawPostToRow`/`mapPostRowToRaw` (`utils-backend-supabase.js`) needed no
changes — `authorType` already round-trips as a plain string with no allowlist. Applied directly via
`supabase db query --linked -f` to **both** Supabase projects, production (`yrzqnlhbawzuzlrrocfd`)
first then staging (`hgctbgunlsesygzglbdv`), confirmed via `pg_get_constraintdef` on each before
relinking back to production (this repo's default) — no Edge Function involved, since posts are
written directly via PostgREST, not through `save-survey`/`admin-users`.

**Admin UI**: `components-admin-editor-{facebook,instagram,x}.jsx`'s existing "Author Type"
`RadioGroup` gained a 4th option, `{ value: "random", label: "Random (male or female)" }`, plus a
hint line explaining the per-post-not-per-feed distinction when selected. X's editor already offered
"company" despite X's `Feed` never actually bucketing company posts (a separate, pre-existing gap
noted but deliberately not fixed here — out of scope for this change) — "random" only ever resolves
to female/male regardless, so it's unaffected by that gap.

**Verified live**, dev server confirmed working in this environment: `resolvePostAuthorType` tested
directly (male/company/female/missing pass through unchanged; "random" stable for a repeated
identical seed, and produced both "female" and "male" across different seeds). Mounted the real
`Feed` (`ui-posts-facebook.jsx`, via `../ui-posts` — not a reimplementation) with one `authorType:
"random"` post and one `authorType: "male"` post, `randomize_names`/`randomize_avatars` both on: two
different simulated participants (`runSeed` "participantA"/"participantB") got genuinely different,
correctly-gendered names for the random post ("Adeline Phillips" — confirmed present in
`FB_FEMALE_NAMES` — vs. "Ryder White" — confirmed present in `FB_MALE_NAMES`, `names.jsx`), and
re-mounting "participantA" again reproduced the exact same name, confirming per-participant
stability. Mounted the real `AdminPostEditor` (Facebook) and confirmed the new radio option renders,
is selectable via a real click (`editing.authorType` correctly became `"random"`), and shows the
new hint text. Regression-checked all three affected apps (`?app=fb/ig/x`) load with zero new
console errors beyond the pre-existing, already-documented CORS limitation (avatar-pool fetches
blocked from `localhost` — real participants on the deployed domains are unaffected). **Not
verified**: an actual click-through by a real logged-in admin, or a real disposable-project insert
against the live DB with `author_type = 'random'` (the constraint's own `pg_get_constraintdef` was
checked directly on both projects instead, which is authoritative for whether the write would be
accepted — a full disposable-row test would have been redundant with that).

**Deploy status**: this session's working tree was on the `production` branch (not `main`) — per
this file's own "Deployment" section, `production` is what GitHub Actions deploys straight to
`studyfeed.org`, with no Netlify-staging soak in between. Nothing was committed/pushed by Claude
(this repo's standing pattern); worth routing this through `main` → staging first before it reaches
`production`, same recommendation this file has made before for other first-draft multi-file
changes landing on this branch.

## Two real bugs found and fixed: post-reminder names never actually randomized without a live feed view, and the Survey Preview froze names across experiment groups (2026-09-11)

Direct report: "I went through the 15 groups [in Survey Preview] and in some of them the post
reminder kept saying the same name 'Spencer Johnson' although the 15 feeds all have the random name
feature on." Investigated live (dev server, cache-busted component mounts — no admin login
available, same standing limitation as everywhere else in this file) and found two separate, real,
pre-existing bugs, not one.

**Bug 1 — Facebook/X's `PostCard` has no name-randomization fallback of its own; `ui-survey.jsx`/
`ui-survey-mobile.jsx` never supplied one.** `PostCard`'s `displayAuthor` (`ui-posts-{facebook,x}.jsx`)
is `assignedAuthor || post.author || ...` — it only ever shows a randomized name when something
external computed and passed `assignedAuthor` (the real `Feed` component does this, building a
deterministic per-bucket assignment map across all posts). `PostReminderCard`
(`ui-survey.jsx`/`-mobile.jsx`) already had exactly this pattern for **avatars** — a no-snapshot
fallback (`assignedAvatarUrl`, added when the "random" Author Type feature shipped earlier this
session) that resolves a real pool avatar whenever the participant hasn't actually viewed the post
live — but **no equivalent ever existed for names**. So any post-reminder question rendered without
a "displayed post snapshot" (survey-only delivery, a reminder targeting a feed/post the participant
never visited, or — as reported — every render inside the admin's Survey Preview, which has no live
feed session at all) silently fell back to the raw, unrandomized `post.author` regardless of the
feed's real `randomize_names` flag. "Spencer Johnson" was simply that literal stored value —
appearing identically across every group whose post-reminder happened to reference a post carrying
that raw author field (the well-documented "shared template post duplicated across Control/
Treatment/PL/PS variants" pattern this file already has a name for). This is a real bug for actual
participant delivery too, not just the preview — any survey-only study, or any reminder pointing at
a feed/post the participant didn't personally walk through, has been showing unrandomized names this
whole time regardless of the feed's own `randomize_names` setting.

**Fix**: new `assignedAuthor` memo in `PostReminderCard`/`PostReminderCardMobile`, mirroring the
existing `assignedAvatarUrl` effect's shape exactly — resolves the post's effective gender via
`resolvePostAuthorType` (the helper from this same session's "random" Author Type feature, so this
also correctly randomizes gender-random posts here for the first time) and picks a name from
`FB_FEMALE_NAMES`/`FB_MALE_NAMES`/`FB_COMPANY_NAMES` via `pickDeterministic`, same seed shape
(`participantSeed`/`app`/`projectId`/`feedId`/`post.id`) as the avatar fallback, with a
`"reminder-name"` suffix instead of `"reminder-avatar"`. Unlike the avatar pick, name pools are
plain in-memory arrays — no network fetch needed, so this is a synchronous `useMemo`, not an
effect+state pair. Threaded through `ReminderPostInner`/`ReminderPostInnerMobile` and
`RecallOptionCard`/`RecallOptionCardMobile` (both render call sites, plain reminder and the recall
3-option picker) alongside the existing `assignedAvatarUrl` prop, including each component's custom
`memo()` comparator. Instagram needed no change — its `PostCard` already computes its own name
internally via `pickDeterministic` regardless of any `assignedAuthor` prop, which is exactly why the
user's report said "in *some* of them," not all: whichever groups' reminders happened to be Instagram
(or referenced genuinely distinct, non-template posts) were likely already fine.

**Bug 2, found while verifying Bug 1 — the Survey Preview writes real participant-facing state into
the browser's actual localStorage.** `PostReminderCard` reuses the real `PostCard`, which has a
"displayed post snapshot" mechanism (`saveDisplayedPostSnapshot`/`getDisplayedPostSnapshot`) built
for real participants — on every render it records "what this participant is currently seeing" so a
later post-reminder question can show the *exact* version they actually viewed. `SurveyPreviewModal`
never suppresses this (only the "recall" 3-option picker already did, via its existing
`suppressDisplayedSnapshot` prop) — so previewing any ordinary post-reminder question writes a real
snapshot to the admin's own browser, keyed by `(projectId, "preview" participantSeed, feedId,
postId)`. Since `SurveyPreviewModal`'s `participantSeed` is fixed to `"preview"` (or
`"preview-N"` after Reshuffle) **regardless of which experiment group is selected**, the *first*
group previewed whose reminder references a given feed+post permanently freezes what every *other*
group referencing that same feed+post shows for the rest of the browser's lifetime (until that
`localStorage` key is manually cleared) — a second, independent explanation for "kept saying the
same name," and one that would have kept masking Bug 1's fix during exactly the kind of
group-by-group verification the report describes doing.

**Fix**: new `disableReminderSnapshot` prop threaded through `SurveyScreen`/`SurveyScreenMobile` →
`SurveyQuestionRenderer`/`-Mobile` → `PostReminderCard`/`-Mobile` (added to each memo's comparator
where one exists) — when true, `storedSnapshot` always resolves to `null` (skips the
`getDisplayedPostSnapshot` read entirely, so a *pre-existing* stale snapshot from an earlier preview
session is also correctly ignored, not just future writes prevented) and `suppressDisplayedSnapshot`
is passed through to the plain (non-recall) `ReminderPostInner` render, matching what the recall
picker already did. `SurveyPreviewModal` now passes `disableReminderSnapshot` unconditionally — a
preview has no real live feed session to "remember," so there's nothing worth freezing.

**Verified live**, dev server confirmed working, via the established mount-with-fabricated-data
technique (no admin login available): reproduced Bug 1 exactly — a fresh participant seed showed the
raw `"Spencer Johnson"` before the fix, a real pool name after; confirmed determinism (same seed →
same name across remounts) and variation (different seeds → different, correctly-gendered names,
including for `authorType: "random"` posts). Reproduced Bug 2 directly: two "groups" referencing the
same feed+post, same `"preview"` seed — without `disableReminderSnapshot`, the second silently
inherited whatever name the first happened to render, and two real `localStorage` keys were created;
with the fix, zero keys were written. Went further and proved the *read* suppression specifically —
pre-seeded a deliberately fake stale snapshot (`"STALE FROZEN NAME"`, a value no real pool
resolution could ever produce) directly into `localStorage`, confirmed the pre-fix code path
faithfully displayed it, and confirmed `disableReminderSnapshot` correctly ignored it and resolved a
real name instead. Confirmed Reshuffle still works correctly with the fix (`"preview"`/`"preview-1"`/
`"preview-2"` each independently and repeatably resolve to different names). One real debugging
detour worth recording: the very first several verification attempts appeared to show the fix doing
nothing, traced to two compounding causes rather than one — (1) this sandbox's Vite dev server
serves a *stale* cached module instance when a bare `import()` URL (no cache-busting query) is
reused across script calls without a real page navigation in between, a gotcha this file already
documents for a different pair of files; and (2) even after navigating fresh each time, reusing the
*same* participant/feed/post identity tuple across successive test mounts kept tripping the exact
snapshot-freezing behavior Bug 2 describes, purely as a side effect of the test harness itself —
resolved by using a genuinely fresh participant seed per mount unless the test was specifically about
snapshot behavior. Regression-checked `?app=fb`/`?app=ig` still load with zero new console errors
beyond the pre-existing, already-documented CORS limitation (avatar-pool fetches blocked from
`localhost`). **Not verified**: an actual click-through by a real logged-in admin — same standing
limitation as everywhere else in this file. Worth confirming on staging that the Survey Preview's
post-reminder names now genuinely vary across experiment groups referencing distinct posts, and stay
appropriately consistent (not randomly reshuffling) within one group across repeated views.

**Deploy status**: same as the entry above — this session's working tree is still on the
`production` branch, nothing committed/pushed by Claude. Both fixes here are pure frontend changes
(no schema/Edge Function involved), so — unlike the `posts.author_type` migration above, which is
already live on both Supabase projects — there is nothing backend-side blocking these from shipping
as soon as they're committed; still worth routing through `main` → staging first given neither has
had a real click-through yet.

## Per-post "misinformation" avatar pool (male shipped, female pending) + a real CloudFront CORS regression found and fixed (2026-09-11)

Direct request: the user supplied 42 AI-generated male headshots (organized in `Latino`/`White`/
`Black`/`Asian` local folders, chosen specifically because they're synthetic — "no issue that those
profile pics are in posts that spread misinformation," i.e. no real person's likeness is misattributed
to a misinformation post) and asked for (1) these uploaded to S3, and (2) a way to mark a post as
"misinformation" so avatar randomization draws from this set instead of the regular male pool for
those posts specifically. Female images explicitly deferred to "tomorrow" — the whole design had to
tolerate that gap cleanly, not just work once both genders exist.

**New per-post field, `is_misinformation`** (`posts.is_misinformation boolean not null default
false`, `20260801000039_add_is_misinformation_flag.sql`, applied to both Supabase projects — purely
additive, every existing post defaults `false`). Mapped in `utils-backend-supabase.js`
(`mapPostRowToRaw`/`mapRawPostToRow`, `isMisinformation` ↔ `is_misinformation`, same pattern as
`badge`/`authorType` right next to it). Admin UI: a "Misinformation content" `Toggle` added to the
**Author** section of all three post editors that have an avatar concept
(`components-admin-editor-{facebook,instagram,x}.jsx`, right after the existing "Verification badge"
toggle — Amazon excluded, no avatar/author-gender concept there at all).

**Avatar-pool selection — one shared helper, not four copies of the same fallback logic.** New
`AVATAR_POOLS_ENDPOINTS` entries (`utils-core.js`): `misinformation_female`/`misinformation_male`,
pointing at `avatars/misinformation/{female,male}/index.json` on the same CloudFront/S3 bucket —
`getAvatarPool(kind)` itself needed zero changes, since it already resolves any string key generically
against this map. New exported `getAvatarPoolForPost(kind, isMisinformation)`: returns the plain pool
unconditionally when not misinformation (or for `company`, which has no misinformation variant);
otherwise tries the misinformation-specific pool for that gender and **falls back to the plain pool
whenever it's empty** — this is the load-bearing piece that lets male ship today and female "tomorrow"
with zero further code changes once the female images are uploaded and `avatars/misinformation/
female/index.json` is repopulated. Before this, every consumer (`Feed` in `ui-posts-{facebook,x}.jsx`,
`PostCard`'s own per-post effect in `ui-posts-instagram.jsx`, and the post-reminder-question no-live-
snapshot fallback in `ui-survey.jsx`/`ui-survey-mobile.jsx`) called `getAvatarPool(kind)` directly —
duplicating "does this post need the special pool, and what if it's empty" four times would have been
exactly the kind of footgun this file already has a name for; instead all four now call the one shared
helper.

**Facebook/X's `Feed` needed real restructuring, not just a swapped function call**, since it builds
one deterministic assignment map per gender bucket across *all* posts in that bucket at once
(`buildDeterministicAssignmentMap`) — a post's misinformation flag can vary within a gender bucket, so
each gender bucket was split further into `{gender}NormalPosts`/`{gender}MisinfoPosts`, each getting
its own assignment map (`avatarMaps.female`/`.male`/`.femaleMisinfo`/`.maleMisinfo`), with the misinfo
maps built from `getAvatarPoolForPost(gender, true)` (so they already reflect the fallback). The
per-post render pick then branches on `post.isMisinformation` in addition to the existing resolved-
gender branch. Instagram needed no such restructuring — its `PostCard` already resolves its own avatar
independently per post in a local effect, so the fix there was a one-line swap of which function it
calls. All three `App-*.jsx` files' asset-preload warm-up effect (which primes `getAvatarPool`'s
internal cache before `Feed`/`PostCard` actually need it, mirroring the existing "random Author Type
warms both genders" case right above it) now also warms both `misinformation_female`/
`misinformation_male` cache entries whenever any post in the feed is flagged — a preload nicety, not a
correctness requirement, since the real consumers fetch it themselves regardless.

**Pipeline for the 42 male images**: resized locally with `sips` to the same 320px-max-dimension/
quality-78 JPEG convention the 2026-08-02 avatar-compression pass established (2832×4064-style
originals → ~320×308, ~86MB of PNGs → 1.3MB of JPEGs), renamed `{ethnicity}-{original-stem}.jpg` to
avoid real filename collisions across ethnicity folders (`m20.png`/`m44.png`/`m55.png` each existed in
more than one ethnicity folder), uploaded to `avatars/misinformation/male/{latino,white,black,asian}/`
(ethnicity kept as both folder and filename prefix — the consuming code treats this as one flat pool
today, but the folder structure keeps ethnicity visible in the bucket for any future ethnicity-aware
balancing work). `index.json` built as a flat array of full CloudFront URLs across all four ethnicity
subfolders, matching the exact absolute-URL format the real `avatars/male/index.json`/`avatars/female/
index.json` already use (confirmed by fetching them directly rather than assumed). Also seeded
`avatars/misinformation/female/index.json` as a literal `[]` — so `getAvatarPoolForPost("female",
true)` resolves to a clean, fast empty-array fallback today instead of a 404, and tomorrow's upload
just needs to overwrite that one file with the real list, no code or cache-key changes needed.

### Real, live infrastructure bug found while verifying — and fixed, with explicit sign-off first

Verifying the new `index.json` against the real CDN (the same `curl -H "Origin: ..."` battery this
file's own 2026-08-08 CORS entry established) found the exact class of bug that entry documents as
already fixed — but it had regressed. `avatars/misinformation/male/index.json` returned **zero**
`Access-Control-Allow-Origin` header for *any* origin, including a deliberately bogus
`evil-example.com` test origin, which should never get a CORS header at all — proving the response
being served wasn't even doing per-origin matching, it was a single cached response shared across every
requester regardless of `Origin`. This isn't specific to the new files — the exact same bogus-origin
test against every path on this CDN would misbehave identically, since it's a distribution-wide setting.

**Root cause, precisely diagnosed via `aws cloudfront get-distribution-config` rather than assumed**:
the distribution's **origin request policy** was already correctly set to `Managed-CORS-S3Origin`
(forwards `Origin` to S3 on a cache miss) — but its **cache policy** was `Managed-CachingOptimized`,
whose `HeadersConfig` is `{"HeaderBehavior": "none"}`, meaning `Origin` plays no part in the cache
*key*. Concretely: whichever origin's request happens to reach a given CloudFront edge first triggers
an origin fetch (with `Origin` correctly forwarded, and S3 correctly returning a matching CORS header
for that one origin) — but the **cached response** is then keyed only by URL, so every subsequent
request to that same URL from *any* other origin gets served that exact same cached response,
including its now-mismatched (or in this case, since the very first hit had no `Origin` header at all,
completely absent) CORS header. This is the identical bug class the 2026-08-08 entry root-caused and
fixed by (per that entry's own wording) "switching the `Default (*)` behavior's cache policy to
`Managed-CORS-S3Origin`" — a slightly imprecise description in hindsight, since `Managed-CORS-S3Origin`
is actually an *origin request* policy, not a cache policy, and no AWS-managed *cache* policy varies by
`Origin` at all; the distribution's origin-request-policy half of that fix was still correctly in place
today, but the cache-policy half had reverted to `Managed-CachingOptimized` (cause unknown — possibly a
later, unrelated config push that only touched that one field) with nothing to actually vary the cache
by origin, which is what let the poisoning symptom return.

**Flagged to the user before touching anything, given the blast radius (a shared, production CDN
setting affecting every image on every live study, not just today's new files) — user said yes, fix
it.** New custom cache policy `CachingOptimized-VaryByOrigin`
(`a43e5b11-bb95-4319-8d6e-0b49a791ff48`) — identical TTLs/gzip/brotli settings to
`Managed-CachingOptimized`, with `HeadersConfig` whitelisting `Origin` so the cache key now genuinely
varies per requesting origin. Attached as the distribution's `DefaultCacheBehavior.CachePolicyId` via
`update-distribution` (existing `OriginRequestPolicyId` left untouched, since that half was already
correct). No invalidation of existing cached objects was needed or attempted — a cache-policy change
that adds a dimension to the cache key means old entries simply can't match the new key shape; they
sit orphaned until their TTL expires, causing no harm, while every new request immediately gets a
fresh, correctly-origin-scoped cache entry.

**Verified after the distribution redeployed** (`Status: Deployed`, confirmed via polling
`get-distribution`, ~40s): `studyfeed.org` and `staging.studyfeed.org` each now get their own
correctly-matching `Access-Control-Allow-Origin` on a fresh `Miss from cloudfront`, a *repeated*
request from the same origin now correctly gets `Hit from cloudfront` with the same correct header
(proving it's now genuinely caching per-origin, not just always missing), and the bogus
`evil-example.com` origin correctly gets **no** CORS header at all on either a miss or (implicitly) any
future hit — S3's own `AllowedOrigins` list is still the real gate, this fix only stopped CloudFront
from short-circuiting it. Re-confirmed the pre-existing `avatars/male/index.json` path is unaffected/
still correct. This fix is distribution-wide, so it should also resolve any other CORS-flakiness reports
on avatar/topic-image loading beyond just the new misinformation pool, if any surface later.

**Frontend verification, separate from the CDN fix**: `getAvatarPoolForPost` tested directly with a
mocked `fetch` (male-misinfo populated, female-misinfo empty, matching today's real real-world state
exactly) — confirmed the male branch returns the misinfo-specific list and the female branch cleanly
falls back to the plain female list. The real `Feed` (`ui-posts/index.js`, not a reimplementation) was
mounted with three fabricated posts — plain male, misinformation-flagged male, plain female — and
`randomize_avatars: true`; confirmed via the rendered `<img src>` on each card that the plain male post
got a normal-pool avatar, the misinformation-flagged male post got a misinformation-pool avatar, and
the female post (no misinfo pool populated) correctly fell back to the plain female pool. All ten
touched files (`utils-core.js`, `utils-backend-supabase.js`, `ui-posts-{facebook,x,instagram}.jsx`,
`ui-survey.jsx`/`-mobile.jsx`, `App-{facebook,x,instagram}.jsx`, the three post editors) parse clean
(`@babel/parser`); reloading `?app=fb`/`?app=ig`/`?app=amz` fresh showed no new console errors beyond
this sandbox's own already-documented `localhost`-not-on-CDN-allowlist CORS noise and a stale-buffered-
console-history artifact (confirmed as such by reproducing the identical "error" on an untouched
Amazon page — the same class of tooling false-positive this file's dark-mode entries already document
hitting more than once). **Not verified**: an actual click-through by a real logged-in admin toggling
the new "Misinformation content" switch, or a real participant loading a feed with a misinformation
post and `randomize_avatars` on — same standing no-login limitation as everywhere else in this file.

**Status**: schema migration live on both Supabase projects; all 42 male images live on the real S3
bucket/CloudFront distribution (not staged — this was a direct infrastructure write, done with the
user's live AWS session, not a hand-off script); the CloudFront cache-policy fix is live and deployed.
Frontend code changes are uncommitted in the working tree (this session's branch was `production` at
start — check `git status`/`git log` before assuming either way, per this file's own standing note
that auto-commit can happen with zero Claude tool calls). **Still needed from the user**: the 20 female
images ("tomorrow," per their own framing) — once uploaded to
`avatars/misinformation/female/{ethnicity}/` and `avatars/misinformation/female/index.json` is
regenerated to list them (same shape as the male one), the female fallback starts resolving to the
real set with zero further code changes, exactly as designed.

**Update, resolved**: the female pool is live — `avatars/misinformation/female/index.json` now lists
26 real images across all four ethnicity subfolders (confirmed by fetching it directly), not the
placeholder `[]` it shipped with. Not done by the session that wrote this note; picked up while
catching this file up (see "CLAUDE.md catch-up" near the end of this file).

# CLAUDE.md catch-up (2026-09-18) — a run of undocumented commits found and written up

This file went 8 days (2026-09-11 → 2026-09-17) without an update despite 12 real commits landing in
that window — the gap was only noticed when the user asked directly whether CLAUDE.md was stale. The
sections immediately below (through "Instagram: real focal-point/zoom image cropper") cover that
backlog, reconstructed from each commit's own diff and code comments rather than from live sessions —
**none of them carry this file's usual "Verified: ..." paragraph**, since nothing here was actually
re-tested by the session writing this catch-up; each one says so explicitly. Two sections above this
one (the "diverse viewpoints" toggle and the power-analysis extension) were inserted earlier in the
file, in their correct chronological position, for the same reason and with the same caveat. The two
sections *after* this catch-up run (the image-compression fix and its retroactive S3 pass) are this
session's own work and carry full "Verified" detail as usual, since that part was actually done and
tested here, not reconstructed.

**Lesson for whoever next finds a stale-CLAUDE.md gap like this one**: `git log --since=<last CLAUDE.md
commit date>` is the fastest way to find exactly what's missing — this session ran that once, got a
clean list of every undocumented commit, and worked through it in chronological order rather than
guessing which areas of the app might have drifted. Cross-check against the file's own last-updated
date (`git log -1 -- CLAUDE.md`) before assuming recent work is already captured.

## Slider questions: "Hide numeric value" option (2026-09-12)

New per-question `hide_slider_value` boolean on SLIDER-type survey questions — when set, the slider
still renders (drag handle, left/right labels) but the live numeric readout above the handle is
suppressed, useful when a study wants a slider's visual/haptic feel without cueing the participant
to a specific number. Threaded through the same set of places this file's own "known duplicated
logic" section already flags for every other slider/question field: `SliderEditorBlock`
(`components-admin-surveys-editor.jsx`, a new `Toggle` next to Min/Max/Left label/Right label),
`makeQuestion`/`normalizeQuestion`/`frontendQuestionToBackend` (`utils-survey.js`) and its
independent TypeScript mirror (`survey-sanitize.ts`, used by the `save-survey` Edge Function), and
the render logic in both `SurveyQuestionRenderer`/`SurveyQuestionRendererMobile`
(`ui-survey.jsx`/`-mobile.jsx`) — the numeric readout `<div>` is now conditionally rendered instead
of always shown.

**Not independently verified by this session** — reconstructed from the commit diff (`e17fe5f`), not
live-tested here (see "CLAUDE.md catch-up" above).

## Avatar randomization: no more flash-then-swap while the assignment is still resolving (2026-09-12)

Two related fixes, both in service of the same problem: when avatar randomization is on but the
actual randomized pick hasn't resolved yet, `PostCard`/`PostReminderCard` used to fall back to the
post's *raw stored* avatar for that first render, then swap to the real randomized photo once it
resolved — meaning a participant could briefly see one person's photo before it changed to a
different person's. Fixed across Facebook/Instagram/X (`ui-posts-{facebook,instagram,x}.jsx`) by
rendering blank (no avatar) instead of the raw fallback during that window — a blank circle reads as
"still loading," a photo swap does not. The real feed itself never hits this window (`Feed`'s own
`avatarMaps` effect resolves every post's assignment before `PostCard` ever mounts); it's
specifically `PostReminderCard`'s async no-snapshot fallback path (a reminder targeting a feed/post
the participant never actually visited live) that can render before the pick is ready.

Second, related fix: `preloadSurveyPostReminders` (all three `App-*.jsx`) was still calling the
plain `getAvatarPool(kind)` to warm the cache ahead of a reminder rendering, instead of
`getAvatarPoolForPost(kind, isMisinformation)` — the function the 2026-09-11 misinformation-avatar-
pool work made the real render-time source of truth. For a misinformation-flagged post this warmed
the *wrong* pool entirely, leaving the real pick to load cold once the reminder actually rendered —
undoing part of the point of preloading. Fixed identically in all three files.

X's `PostCard` also got one more piece: its `displayedSnapshot` (the "what did this participant
actually see" mechanism reminders read back later) used to always overwrite `avatarUrl` with
whatever `avatarUrl` currently was — including blank, during the same resolving window above — so a
reminder recovering that snapshot could get stuck with a permanently blank avatar even after the
real pick resolved moments later. Fixed to only overwrite the snapshot's avatar once a real URL is
known, leaving the post's own existing `avatarUrl` in place otherwise.

**Not independently verified by this session** — reconstructed from the commit diff (`365be2d`) and
its own code comments, not live-tested here (see "CLAUDE.md catch-up" above).

## Survey codebook / data dictionary (2026-09-12 – 2026-09-15)

New "codebook" feature on the Survey Participants page and the Surveys admin panel's own editor:
given a survey, generates a full data dictionary — one row per column any real CSV export of that
survey could produce — grouped into sections (Participant & session, Experiment, Data quality,
Survey questions, Per-post engagement columns), with response coding spelled out (choice
value→label mappings, scale endpoints, attention-check/screener annotations). Deliberately built
**on top of `flattenSurveyQuestions`** (`utils-backend.js`) — the exact same function every real CSV
builder in this file already goes through — specifically so a codebook variable name can never drift
out of sync with what a real downloaded CSV actually calls that column.

Shipped in three passes over four days:
1. **Built** (`85ed573`, 2026-09-12): `buildSurveyCodebookRows`/`buildSurveyCodebookCsv`/
   `buildSurveyCodebookHtmlDocument` in `utils-backend.js`, offered as three download formats —
   Word (`triggerWordCompatibleDocumentDownload`, a `.doc`-extension HTML blob with a UTF-8 BOM so
   Word opens it as a real document), PDF (`triggerHtmlPrintDialog`, save-as-PDF via the browser's
   own print dialog), and plain CSV.
2. **Refined** (`44476df`/`9ec95f1`/`a3a4881`/`c3d98e2`, 2026-09-13): gated the "feed + survey"
   CSV/codebook buttons away from `survey_only` delivery mode (a survey_only study's linked feeds
   can be pure post_reminder content sources a participant never actually visits, so merging them
   in never made sense); added a `resolvePost` option to `flattenSurveyQuestions` so a specific
   post_reminder question's CSV/codebook columns only list fields that post can actually produce
   (Amazon's `review_helpful` only for an Amazon post, a note's `note_group2_size_shown` only when
   that note genuinely has a second contributor group configured) instead of every conceivable field
   unconditionally; added a platform-only relevance filter for the codebook's generic "Per-post
   engagement columns" reference section (no specific post to check against there, so this drops
   columns the *current platform* could never produce at all — Amazon's `review_*` fields on a
   Facebook-linked survey, etc.); and added shared-stem grouping to the HTML/Word document — a
   matrix question's rows, or several post_reminder "conditions" that happen to share identical
   instruction text pointing at different posts, collapse into one stem line plus a compact per-item
   sub-table instead of repeating the same question text on every row.
3. **Word and CSV variants removed, PDF kept** (`a199b8e`, 2026-09-15) — per direct request.
   `buildSurveyCodebookCsv` and `triggerWordCompatibleDocumentDownload` were deleted outright (not
   just hidden from the UI), along with every "Codebook Word"/"Codebook CSV" button on both admin
   pages. The PDF format (`buildSurveyCodebookHtmlDocument` + `triggerHtmlPrintDialog`) is the only
   codebook export offered today.

**Not independently verified by this session** — reconstructed from the four commits' diffs and
their own code comments, not live-tested here (see "CLAUDE.md catch-up" above). Worth a real
click-through of "Codebook PDF" on a survey with a mix of matrix/slider/post_reminder/attention-check
questions before trusting the current (post-removal) state beyond the code read.

## Question library: organizational categories (2026-09-17)

Library items (reusable saved questions/measures, `components-admin-question-library.jsx`) gained a
`category` field — Mediator / Dependent Variable / Demographic / Other, a small fixed set via a
`<select>`, not freeform — so the picker modal groups a growing library into labeled sections
(color-coded `Badge`s, three new tone variants — `success`/`warning`/`info` — added to the shared
`Badge` component for this) instead of one flat list. New `question_library_items.category` column
(`20260801000040_add_question_library_category.sql`), plain unconstrained text at the DB level (the
fixed four-value set is enforced client-side only, so a fifth category can be added later with no
migration) defaulting to `'other'` — additive, no backfill needed since `'other'` is already the
right bucket for anything saved before this shipped. The picker modal also widened (560px → 880px)
and its per-item cards moved into a responsive grid within each category section.

**Not independently verified by this session** — reconstructed from the commit diff (`072dc3d`), not
live-tested here (see "CLAUDE.md catch-up" above).

## Real bug found and fixed: Instagram survey-only launch links with linked feeds stuck in an infinite loading loop (2026-09-17)

`App-instagram.jsx`'s boot sequence, on resolving a direct survey link whose survey has linked feeds,
set `activeFeedId` to the first linked feed but never called `setFeedIdInUrl` to keep the URL in
sync — Facebook/Amazon/X's equivalent boot code already pairs every `setActiveFeedId(...)` during
boot with a matching `setFeedIdInUrl(...)` for exactly this reason (a comment on the fix names it
directly) — this was the one spot in this file missing it. Without it, the "URL changed" effect —
which re-derives `activeFeedId` from the URL on every change — saw the URL and component state
disagree, reset `activeFeedId` back to null, and re-ran `startBoot()`, landing right back at the same
unsynced state: a genuine infinite "Loading study…"/preface loop for any Instagram survey-only launch
link whose survey links at least one feed. Fixed by calling
`setFeedIdInUrl(resolvedFirstFeedId, { replace: true })` alongside the existing `setActiveFeedId`
call, matching the other three apps.

**Not independently verified by this session** — reconstructed from the commit diff (`b200887`) and
its own code comment (detailed enough to be confident in the root-cause explanation), not live-tested
here (see "CLAUDE.md catch-up" above).

## Instagram: real focal-point/zoom image cropper, replacing the old X/Y-slider one (2026-09-17)

`ImageCropper` (`components-admin-media-instagram.jsx`, used by the single-image field, the video
poster field, and each slide of the carousel editor) was rebuilt from three plain 0–100 range-input
sliders (X position / Y position / Zoom, driving a CSS `background-position`/`background-size` div)
into a real drag-to-reposition, scroll/pinch/double-click-to-zoom tool — drag the photo directly,
mouse wheel or pinch to zoom (anchored to the pointer/pinch midpoint, not just the existing focal
point, so zooming feels like it zooms "into" wherever you're pointing), double-click/double-tap to
toggle between 100%/220% zoom, arrow keys to nudge, a rule-of-thirds guide shown only while actively
dragging/pinching, and a zoom slider + +/−/Reset controls for precision. The underlying stored shape
is unchanged (`{focalX, focalY, zoom}` per image), and zoom range widened from 0.5–3 (the old slider
allowed zooming *out* past full coverage, which could reveal empty space around the image) to a new
shared `IMAGE_CROP_MIN_ZOOM`/`IMAGE_CROP_MAX_ZOOM` (1–4, `utils-core.js`) — 1 is the floor specifically
because `object-fit:cover` already guarantees full coverage at zoom 1 for any focal point, so anything
below that can only under-cover.

New shared `getImageCropStyle({focalX, focalY, zoom})` (`utils-core.js`) is the single source of
truth for turning that stored shape into actual crop CSS (`object-fit:cover` + `object-position`,
plus a `transform:scale()` anchored via `transform-origin` once zoomed past 1×) — used by both the
admin cropper's own live preview *and* every place a cropped image actually renders to a real
participant (`ui-posts-instagram.jsx`'s main feed card, the carousel via `IGCarousel`'s new
`cropStyle` prop, and the comment-modal media pane), so "what the admin sees while cropping" and
"what a participant sees" can't drift apart.

**Verified only to the extent of confirming this doesn't touch upload/compression logic** — this
session read the full diff while investigating a separate image-compression report (see the next
section) specifically to rule out this commit as the cause, and confirmed it's purely a
display/interaction change (plus one CSS `key` prop addition on the carousel's cropper instance).
No live click-through of the drag/zoom/pinch interactions themselves was done here (see "CLAUDE.md
catch-up" above).

## Real bug found and fixed: a hard reload of a non-Facebook admin session always reloaded the Facebook bundle (2026-09-17)

Direct continuation of the `getApp()`-has-no-fallback bug documented earlier in this file
(2026-08-23) — that fix addressed the *runtime* symptom (React code calling `getApp()` after the URL
lost `?app=`), but `index.html`'s own inline bootstrap script — which decides which platform *bundle*
to `import()` in the first place, before any React code runs at all — had the identical gap one layer
earlier: `const app = (params.get("app") || "facebook").toLowerCase();`, unconditionally. Since
several admin navigation actions (the platform picker's "already on this platform" shortcut, sidebar
nav links) route to a bare path with no query string, a hard reload of an Instagram or X admin
session could silently reload the *Facebook* bundle entirely — not just misreport the platform
internally, but load the wrong app's code.

Fixed with the same pattern `getProjectId()` (`utils-core.js`) already uses for `?project=` — a
`localStorage` fallback (`admin_app_v1`) that remembers the last real `?app=` value seen on an admin
route, read only when the URL itself has none *and* the route is `/admin/*`, and written every time
an admin route does have one. Deliberately scoped to admin routes only — a real participant launch
link must always carry its own explicit `?app=` and never falls back to a remembered value, so a
previous admin session on the same browser/device can't affect a participant's launch link.

**Not independently verified by this session** — reconstructed from the commit (`d230727`) itself,
which carries an unusually detailed code comment explaining the exact reasoning (quoted above almost
verbatim), not live-tested here (see "CLAUDE.md catch-up" above).

## Image compression: fixed quality wasn't adaptive, plus a retroactive S3 pass (2026-09-17/18)

Direct report: newly-uploaded Instagram images were "bigger than needed for the form factor" and
slow to load. Investigated by downloading the actual reported images directly from CloudFront and
checking them — the upload-time compressor (`utils-image-compress.js`, built 2026-08-04, see
"Button consistency sweep, image compression, and two bugs found from real user reports" above)
*was* running correctly (all four were downscaled to exactly 1400px on the long edge, the "feed"
preset's dimension cap) — the bug was that it only ever tried one fixed JPEG quality (0.8), and for
busy/high-detail real-world photos (dense foliage, textured stock photography) that still landed
anywhere from ~300KB to ~950KB even after the dimension cap. Confirmed directly (re-encoding the
same images via `sips` at progressively lower quality) that dropping quality meaningfully further —
65%, then 50% — cut size by 35–55% for exactly this kind of content, with no dimension change.

**Fixed** (`src/utils/utils-image-compress.js`): both presets (`feed`/`avatar`) now try a quality
ladder — `[0.8, 0.65, 0.5]` for feed, `[0.78, 0.65, 0.5]` for avatar — stopping at the first step
that lands under a byte budget (350KB feed / 100KB avatar), or keeping the lowest-quality (smallest)
attempt if even 50% doesn't get there, rather than looping forever. PNG is unaffected (canvas ignores
`quality` for PNG per spec, so only the existing single downscale-and-re-encode applies there, same
as before). This is the one shared function every image upload already goes through across Facebook,
Instagram, *and* X, so the fix applies to all three with no per-platform wiring.

**Verified live** against the real dev server (`npm run dev`, confirmed working in this environment):
a synthetic worst-case (random-noise JPEG, effectively incompressible) correctly ran through all
three quality steps and still landed meaningfully smaller than the old fixed-quality-0.8 result; a
synthetic easy case (smooth gradient) correctly stopped after one `canvas.toBlob` call once already
under budget — confirmed via a monkey-patched `HTMLCanvasElement.prototype.toBlob` call counter, not
just the output size. Regression-checked PNG (still exactly one encode, no wasted quality-ladder
attempts), GIF (still passed through completely untouched), and the "already small enough" fast path
(still skipped entirely, byte-identical output, same object reference) — all three preserved from
before the fix.

**Retroactive pass over what was already on S3**: wrote a Python script (scratchpad-only, matching
this repo's established pattern for AWS write scripts — see "Oversized per-post images" 2026-08-08/09
above) mirroring the new client-side logic exactly — same 1400px cap, same `[80,65,50]` quality
ladder, same 350KB budget — with a dry run first. Scanned `s3://my-video-feed/images/` (excluding the
20 real topic-image pool folders already handled by earlier passes): 87 candidate per-post images, 45
initially flagged as oversized. Before running for real, spot-checked a couple of the flagged PNGs
directly and found `sips` re-saving an already-right-sized PNG can make it **bigger**, not smaller
(PNG has no real quality lever available here) — added a "never make it worse" safety check (skip
the write entirely if the re-encoded result isn't actually smaller, mirroring `compressImageFile`'s
own identical guard) and a separate skip for any already-≤1400px PNG/webp (nothing productive to do
there without a real PNG optimizer, which isn't available). Also added a retry-with-backoff wrapper
around every `aws` CLI call after hitting one transient failure mid-run (the identical command
succeeded immediately on retry — matches this bucket/region's already-documented occasional
flakiness, see the 2026-08-02 avatar/topic-image entry) and a per-file try/except so one failure
can't abort the whole batch.

**Real run result**: 26 images genuinely shrunk (up to 58% smaller), originals backed up first to
`images_originals_backup_2026-09-17/` (bucket has no versioning, so this is the real undo path),
CloudFront invalidated for exactly the touched paths. 3 large PNGs were correctly left untouched by
the new safety check (would have gotten bigger). 3 `.webp` files failed — this Mac's `sips` can write
JPEG/PNG but not webp output at all (a real, permanent tool limitation, confirmed non-transient —
retries didn't help); those are still >1400px in one dimension but not large in bytes (89–209KB),
flagged to the user as a known, lower-priority gap rather than silently left unmentioned. Verified
against the live CDN with a cache-busting query that the new (smaller) bytes are actually being
served for the four originally-reported images specifically.

**Not done**: the 3 failed `.webp` files (would need converting to JPEG instead of resizing in place,
not attempted); the 3 skipped large PNGs (would need JPEG conversion or a real PNG optimizer neither
Claude nor this Mac's tools have — flagged to the user rather than decided unilaterally, no response
yet as of this note).

## Real bug found and fixed: deleting a survey with any real participants blocked by a missing FK rule (2026-09-18)

Direct report: deleting a survey failed with `update or delete on table "surveys" violates foreign
key constraint "participants_survey_id_fkey" on table "participants"`. Checked every table that
references `surveys(id)` — `feed_surveys`/`survey_responses`/`experiment_assignments`/
`experiment_group_counters`/`experiment_groups`/`custom_measure_groups`/`ai_report_context` are all
`on delete cascade`. `participants.survey_id` (`20260801000006_participants.sql`) was the one
outlier, declared with no `on delete` clause at all — defaults to `NO ACTION`, blocking the delete
outright. Confirmed live: 4 real surveys currently have participant rows attached, one with 1,452.

**Fixed with `on delete set null`, deliberately not cascade** like its siblings above
(`20260801000041_fix_participants_survey_id_fkey_on_delete.sql`) — a `participants` row is real
feed-visit/engagement data whose primary link is `feed_id` (a separate FK on the same row, already
cascading); `survey_id` is just a "which survey this participant was en route to" stamp (see the
2026-08-11 "feed + survey CSV leaked another survey's participants" entry for how that stamp is
used). Cascading would have silently destroyed 1,452 real participant records the moment someone
deleted that one survey — `set null` detaches the now-dangling reference and keeps the row. Mirrors
the identical pattern `survey_responses.feed_id`/`project_id` already use for the same shape of
problem. Applied directly via `supabase db query --linked -f` to both Supabase projects, production
first then staging (relinked back to production after, this repo's default); verified via
`pg_get_constraintdef` on both before and after.

## Slider questions: "Start at midpoint" option (2026-09-18)

Direct request. Companion to the existing "Hide numeric value" toggle (2026-09-12 above) — a new
`slider_start_midpoint` boolean starts the handle at the midpoint of min/max instead of at min, a
neutral starting position rather than one that visually pre-favors the low end. Threaded through
every place `hide_slider_value` already lives (same "known duplicated logic" set this file already
flags): `makeQuestion`/`normalizeQuestion`/`frontendQuestionToBackend` (`utils-survey.js`), the TS
mirror (`survey-sanitize.ts`, redeployed to both Supabase projects), and `normalizeQuestionForEditor`/
`buildSavedQuestion`/`SliderEditorBlock` (`components-admin-surveys-editor.jsx`, a new "Start at
midpoint" `Toggle` next to the existing one, with a hint that live-computes the actual midpoint
number from the question's own min/max).

**Deliberately render-time only, never written into `responses` on its own** — new shared
`getSliderDefaultValue(q)` (`utils-survey.js`, exported) is the single place this is computed, used
by both `ui-survey.jsx`/`ui-survey-mobile.jsx` in place of the old inline `question.min ?? 0`
fallback. `isQuestionAnswered`'s SLIDER case already checked the real stored value, not the visual
default, so a participant who never touches the slider still correctly reads as unanswered — the
midpoint option can't silently manufacture an answer nobody actually gave. Fixed a small adjacent
bug while touching these exact lines: the numeric readout used `value || question.min || 0`, which
would have shown the wrong number if a participant's real answer was legitimately `0` (falsy in JS,
so it fell through to `question.min` instead) — both the handle's `value` and the readout now use
the identical `value === "" || value == null ? getSliderDefaultValue(question) : value` check.

**Verified live**: `getSliderDefaultValue` tested directly (plain range unaffected — still returns
`min`; midpoint on for 0–100 → 50; odd span 1–6 → 4, i.e. rounds 3.5 up; negative range −10–10 → 0;
missing min/max falls back to the same 0/100 defaults every other slider default already uses).
Mounted the real `SurveyScreen` (not a reimplementation) with one plain and one midpoint-enabled
slider — confirmed the midpoint slider's handle and readout both show 50, the plain one both show 0,
and `responses` stayed `{}` for both until a real `input`/`change` event was dispatched, after which
the moved slider correctly read 73 in both places. Mounted the real `SurveyEditor`, expanded the
question, found and clicked the actual "Start at midpoint" toggle — confirmed it set
`slider_start_midpoint: true` on the right question without touching the sibling `hide_slider_value`
field, the hint text showed the correct live-computed midpoint, and toggling back off reverted
cleanly. (One real test-harness gotcha hit along the way, not an app bug: `SurveyEditor` calls
`onSurveyChange` with React's functional-updater form, `(prev) => next`, throughout — a plain
non-`useState` test callback needs to resolve that itself, `typeof next === "function" ? next(prev)
: next`, or it silently stores the updater function instead of the resolved survey.) All four
touched files parse clean (`@babel/parser`); `survey-sanitize.ts` type-checks (`deno check`) and was
deployed to both Supabase projects. Regression-checked `?app=fb`/`?app=ig` admin routes load with
zero console errors. **Not verified**: an actual click-through by a real logged-in admin — same
standing no-login limitation as everywhere else in this file.

## Slider questions: "Step" option (2026-09-19)

Direct request: a per-slider snap increment (e.g. 0–100 in steps of 5) that works independently of "Hide numeric value". New `slider_step` (positive int, default 1 = the old fully-continuous behavior, so every existing slider is unchanged), threaded through the same places as `hide_slider_value`/`slider_start_midpoint`: `makeQuestion`/`normalizeQuestion`/`frontendQuestionToBackend` (`utils-survey.js`), the TS mirror (`survey-sanitize.ts` — **needs redeploying to both Supabase projects or `save-survey` strips the field**), and the editor (`SliderEditorBlock` "Step" field). Renderers (`ui-survey.jsx`/`-mobile.jsx`) pass it as the native range `step`, and when step > 1 draw one tick per reachable stop (`getSliderStepTickFractions`, absolutely placed on the thumb's own track — `.survey-range-ticks--steps` in all four `styles-*.css`) in place of the 5 decorative ticks. New shared `normalizeSliderStep`; `getSliderDefaultValue` snaps the midpoint onto the step grid; the simulator snaps generated answers; the codebook appends "in steps of N". Verified live: real `SurveyScreen` (step 5 → 21 ticks, native snapping 47→45, tick x-position matches thumb centre to <0.1px) and real `SurveyEditor` field (saves `slider_step: 7`, hint text correct). Not verified: real admin click-through.

## Instagram: "AI-generated profile" author label (2026-09-19)

Direct request, from real Instagram screenshots of an AI-account label. New per-post `posts.ai_generated boolean not null default false` (`20260801000042_add_ai_generated_flag.sql`, additive; **must be applied to both Supabase projects before this code is live — `mapRawPostToRow` writes the column on every post save, so an unmigrated DB would reject post saves for every platform**), mapped as `aiGenerated` in `utils-backend-supabase.js`. Instagram post editor: "AI-generated profile" toggle in the Author section. Renders "AI-generated profile" (muted, 12px) directly under the name in `ui-posts-instagram.jsx`, and above the bio text in both `BioHoverCard` and `MobileBioSheet` (passed via `displayBio.aiGenerated`; shows even when the bio has no text, only when "Show Bio" is on for the card itself). Instagram only. Verified live: real `Feed` (label only on the flagged post), real desktop bio card and mobile sheet (label between name and bio text, absent when off), real editor toggle flips `aiGenerated`. Not verified: real admin click-through or a real DB round trip.

## Instagram caption "… more": inline after the last visible word (2026-09-19)

Direct report with a screenshot: a caption whose first sentence is followed by a blank line showed "… more" pinned to the far right of the block (on the blank line), with a large gap after the text. `PostText` (`ui-core-instagram.jsx`) now cuts a collapsed caption at the first paragraph break or after 2 lines (`CAPTION_MAX_LINES`), whichever comes first, and renders "… more" inline right after the last visible word. The cut is measured, not guessed: a hidden probe (same `text` class/width/username prefix) is filled with candidate text + "… more" and binary-searched for the longest prefix that fits in 2 lines (word-boundary aware, never splits an emoji surrogate pair); re-measured on width change / font load / caption change. The old CSS line-clamp + absolutely-positioned `.fade-more` remains as the fallback until the first measurement. Instagram only (Facebook/X/Amazon have their own `PostText`). Verified live with the reported caption, a long single paragraph, a short caption (untouched), a single-newline caption, click-to-expand, and a narrower width. Not verified: real Safari/iOS text metrics. The "more" label is still bold dark; real Instagram may render it in muted grey — not changed.

## Real bug found and fixed: Instagram had no multi-feed-sequence support, so multi-feed studies jumped to the survey after feed 1 (2026-09-19)

Direct report on `survey_x3rpf08tbsmu5fzndh` (`proj_7`, `app=ig`): three experiment groups, each with a 2-feed sequence, but participants reached the survey after one feed. Root cause was the known gap the archive recorded on 2026-08-03 ("Facebook + Amazon only"): `App-instagram.jsx` never had any feed-sequence code (1 mention vs ~54 in Facebook/X/Amazon). Survey data was fine (checked read-only: groups `feed_sequence_ids` = [feed_2,feed_3], [feed_1,feed_3], [feed_6,feed_3]; `delivery_mode: multi_feed_then_survey`). Ported from `App-facebook.jsx`, same shape: `normalizeFeedSequenceIds`/`isSurveyOnlyDeliveryMode` helpers, `feedSequenceIds` state + `effectiveFeedSequenceIds`/`hasNextFeedStage`/`nextFeedIdInSequence`, `startBoot` sets the sequence + first feed (and URL) for direct survey links, `ensureSurveyLoaded` applies the assigned group's own `feed_sequence_ids` (plain survey links only; survey_only unchanged) and corrects the first feed, `loadStudyContent(feedIdOverride)` (posts **and flags** now fetched for the target feed), new `advanceToNextFeed`, "Continue" label + submit branch advancing to the next feed before the survey, and the survey response's `feed_id` = last feed of the sequence. **Instagram is no longer a special case for this feature — keep it in sync with the other three App files.** Verified live against the real survey's data with every write intercepted (nothing written to the real study): mocked group 3 → boot chose `feed_6`, Continue loaded `feed_3` (different posts, URL updated), Continue again reached the survey; one participant row per feed (`feed_6`, `feed_3`). Not verified: the other two groups' sequences, the survey submit itself, a real (unmocked) participant run.

## Image compression, round 3: PNG photos were never re-encoded; "feed" preset tightened; existing per-post images re-compressed (2026-09-19)

Direct report: an Instagram post image rendered black ~3s before loading — a 2.3MB, 1122x1402 **PNG** (`images/global/feed_2/..._hi_sunscreen.png`). Root cause in `utils-image-compress.js`: PNGs were never re-encoded (canvas ignores `quality` for PNG) and only downscaled above the dimension cap, so any PNG photo at/under 1400px passed through untouched (the 2026-09-17 quality ladder only ever applied to JPEG sources). **Fixed**: a PNG/WebP with no transparent pixels (`hasTransparency()`, scans the downscaled canvas; any read failure = "has transparency", the safe direction) is now treated as a photo and re-encoded as JPEG; only genuinely transparent images stay PNG. "feed" preset tightened 1400px/350KB/[.8,.65,.5] → **1080px** (Instagram's own cap; feed card is ~470px) / **150KB** / [.72,.6,.5,.4], skip-under 100KB. Verified in-browser with the real image: 2249KB → 104KB (864x1080, visually indistinguishable at feed size); a transparent PNG stays PNG; a tiny PNG passes through untouched.

**Retroactive pass over S3** (`s3://my-video-feed/images/`, per-post upload folders only — the 20 topic-pool folders were not touched this round): dry-run first, then applied — 65 files, **45.8MB → 8.3MB (82% smaller)**, 0 failures. Same 1080px / quality ladder / 150KB budget, sips-encoded. **Keys unchanged** (so no post/DB URL rewrites): a `.png` key that was converted now holds JPEG bytes served as `Content-Type: image/jpeg` + `Cache-Control: public, max-age=31536000, immutable` (browsers go by Content-Type, not extension — don't add extension-based image handling without knowing this). Originals backed up first under `s3://my-video-feed/images_originals_backup_2026-09-19/` (bucket has no versioning — this is the only undo path), CloudFront invalidated for exactly the touched paths, live CDN spot-checked (reported image now 145KB image/jpeg, CORS headers intact). **Deliberately skipped** (9): 3 PNG/WebP with real transparency, 4 text-heavy `screenshot_*.png` (downscale + JPEG would blur small type — needs a decision), 1 `.heic`. The topic pools (163 files >150KB, 46MB, already JPEG at the older 1400px/350KB target) could be re-squeezed the same way if wanted.

## Real bug found and fixed: `window.APP` was set too late, so a reloaded Instagram/X/Amazon admin had a Facebook-flavored dashboard and preview (2026-09-19)

Direct report: picked a project → Instagram → Instagram dashboard loaded; Cmd+R switched it to Facebook; later, clicking "Instagram" on the platform picker still showed Facebook, and the post editor's live preview was a mix of Instagram and Facebook. **This is the real root cause behind the two earlier `getApp()` entries (2026-08-23 and 2026-09-17), which only fixed part of it.**

**Root cause, reproduced live (not guessed)**: each `main-*.jsx` sets `window.APP = "ig"` etc. — but ES `import`s are hoisted, so that line runs only *after* every module the file imports has already evaluated. Several modules decide the platform **at import time**: `utils-backend.js`'s `export const APP = getApp()`, the per-app dispatch in `ui-posts/index.js` and `ui-core/index.js` (which `PostCard`/`Feed`/etc. to export), and `components-admin-dashboard.jsx`'s `app` constant (which post editor / labels). At that moment `window.APP` is still unset, so they fall back to the URL's `?app=` — and after any in-admin navigation the URL has no `?app=` (sidebar links and the picker's shortcut navigate to bare paths). So `index.html` (via the `admin_app_v1` localStorage fallback added 2026-09-17) correctly loaded the *Instagram bundle*, while all those import-time decisions silently resolved to `"fb"`: reproduced as `window.APP === "ig"` but the original `APP` const `=== "fb"`. That's the "mixed" preview (IG editor pieces + FB post card), and it's why "click Instagram → still Facebook": `App-instagram.jsx` hard-codes `currentApp="ig"`, so `AdminPlatformPicker.pick("ig")` took its "already on this platform" client-side shortcut — no reload, nothing changes.

**Fix** (`index.html`): the bootstrap script now sets `window.APP` (canonicalized: `fb`/`ig`/`amz`/`x`) *before* it `import()`s the bundle, so every import-time consumer sees the right platform regardless of the URL. The `window.APP =` lines in the `main-*.jsx` files are now redundant but harmless; leave them. **Rule going forward**: never rely on a `window.APP` assignment inside a module that also has imports for anything evaluated at import time — set it in `index.html`.

**Verified live** (dev server): with `admin_app_v1` set to each of `ig`/`x`/`amz`/`fb` and a bare `/admin/dashboard` URL (no `?app=`), a fresh page load now gives `window.APP` and the original-module-instance `APP` const both equal to the expected platform (before the fix: `ig` bundle, `APP === "fb"`); an `?app=ig` participant-style link also correct. **Not verified**: an actual logged-in click-through of project → platform → dashboard → Cmd+R and the post editor preview (no admin login available); worth a real check on `staging.studyfeed.org`. Working tree was on the `production` branch — route through `main` first if you want a staging soak.

## Instagram: black square while a post image loads → neutral placeholder (2026-09-19)

Direct report: a 2–3s **black** block before an Instagram post image appears (not a randomized image, no VPN), never seen on Facebook. Root cause was a real Facebook/Instagram structural difference, not network: Instagram's media wrapper (`.insta-media`, `ui-posts-instagram.jsx`) had a hardcoded inline `background:"#000"` around an `position:absolute` image in a fixed 1:1 box, so the black square paints from first render until the image arrives. Facebook's image is an in-flow `<img height:auto>` with no background, so nothing (just the white page) shows while it loads. The black is only needed for **video** (letterboxing) — for a `object-fit:cover` image it is visible only while loading.

**Fix**: new `--ig-media-placeholder` token (`#efefef` light, `#262626` under `.dark-mode`, matching real Instagram) used for `.insta-media` when the post has no video (video keeps `#000`) and for `.igcar-wrap` (carousel, also cover-fitted). The comment-modal media pane (`.ig-comment-media`, `.ig-comment-inner`) is a lightbox and deliberately stays black.

**Not changed, still a possible contributor to the *wait* itself**: post images use `loading="lazy"` (fine for a long feed, adds latency for the first visible post) and were previously oversized (see "Image compression, round 3" — S3 per-post images already re-compressed 2026-09-19; images uploaded before that fix and not in that pass could still be large). If the delay persists after this, check that specific image's byte size on CloudFront and consider `loading="eager"` for the first post.

**Verified live** (dev server): real Instagram `Feed` with an unloaded image post + a video post — image wrapper computed `rgb(239,239,239)` (light) / `rgb(38,38,38)` (`.dark-mode`), video wrapper still `rgb(0,0,0)` in both. **Not verified**: a real slow network load, or the carousel/avatar visuals by eye.

## New: per-post "exclude from feed-wide randomization" (2026-09-19)

Direct request: let specific posts opt out of the feed-level randomization switches (time, avatar, bio, …) — e.g. one anchor post keeps its fixed timestamp/avatar while the rest of the feed is randomized. The feed-level flag itself is never touched; only the flags object handed to that one post's card changes.

**Data**: new `posts.randomize_exclude jsonb not null default '[]'` (`20260801000043_add_randomize_exclude.sql`, additive; **applied to both Supabase projects before any code was written**, since `mapRawPostToRow` writes it on every post save and this repo auto-deploys). Values are any of `time|avatar|name|image|bio`. Maps to `post.randomizeExclude` in `mapPostRowToRaw`/`mapRawPostToRow` (`utils-backend-supabase.js`), sanitized both directions via `normalizeRandomizeExclude` (unknown kinds dropped, never throws on bad JSON). `select("*")` on both post reads, and the mapper is the only per-post field whitelist (checked against `isMisinformation`/`aiGenerated`, the two newest per-post fields).

**Runtime — one chokepoint, not per-flag edits**: `applyPostRandomizationExclusions(flags, post)` (`utils-core.js`) returns `flags` with the excluded kinds' `randomize_*` keys (all legacy spellings) forced false — returning the *same object* when nothing is excluded so dependency arrays are unaffected. Each app's `PostCard` derives its effective `flags` from it once at the top (`ui-posts-{facebook,x,amazon,instagram}.jsx`; FB/X/AMZ via `useMemo`, IG folded into its existing `effectiveFlags`), so every existing `randNamesOn`/`randAvatarOn`/`randImagesOn`/`randTimesOn`/`randBiosOn` gate just works. Deliberately **not** touched: `Feed`'s per-gender assignment maps (an excluded post still consumes a slot in the unique-assignment pool — harmless, keeps everyone else's assignment stable) and the App-*.jsx asset preloads (cache warm-up only). The post-reminder no-snapshot fallbacks (`assignedAvatarUrl` effect / `assignedAuthor` memo in `ui-survey.jsx` **and** its independent `ui-survey-mobile.jsx` copy) skip the pool pick for a post excluding `avatar`/`name`. The debug-only `?forcerand=1` URL param still overrides exclusions (it forces everything on, by design).

**Per-platform options** (only what each platform actually randomizes, so no dead checkbox): Facebook/Instagram = time, avatar, name, image, bio; X = time, avatar, name; Amazon = time, name. Admin UI: shared `RandomizeExcludeField` (`components-admin-editor-ui.jsx`) in a new "Randomization" `EditorSection` (with an "N excluded" badge) right after "Post content" in all four editors (Amazon: before "Participant actions"). **Adding a new randomizable kind later**: extend `RANDOMIZE_EXCLUDE_KINDS` + `RANDOMIZE_EXCLUDE_FLAG_KEYS` (`utils-core.js`), the label map in the UI file, and each editor's `kinds` list.

**Verified**: real `Feed` per platform (dev server, avatar-pool fetch stubbed) with every randomization on — FB: normal post randomized name/time/avatar; excluding time+name kept those raw while avatar stayed randomized (independent per item); excluding all kept everything raw. IG, X (incl. avatar-only exclusion), and Amazon (name+time) all confirmed the same way. 14 Node checks against the real bundled helper + real `mapPostRowToRaw`/`mapRawPostToRow` (identity when empty, no mutation, junk/alias handling, write/read round-trip, legacy row without the column). Live DB: rolled-back transaction on production inserted a post with `["time","avatar"]` and read it back in order, default `[]` for a post that omits it, zero leftover rows. Real Facebook `AdminPostEditor` mounted: section renders in the right place, clicking checkboxes updates `editing.randomizeExclude` and the badge, unticking removes it. **Not verified**: the image and bio exclusions behaviourally (same flag mechanism, but no image/bio-hover post was rendered), the post-reminder fallback guards (parse-checked only), an actual logged-in save through the real admin UI to a real feed, or the Instagram/X/Amazon editors mounted (only their `kinds` lists read).

## Data operation: two new Instagram feeds created in proj_7 from the updated "Human" feed (2026-09-20)

Direct request: the user had updated the 5 non-intervention ("NOISE1–5") posts in `proj_7` ig `feed_2` (Human Influencer Intervention) and wanted the same updates in the Virtual and Stylised arms without touching those arms' own intervention post, saved as new feeds. Created directly in production (`supabase db query --linked -f`, after a rolled-back dry run): **`feed_7` "Virtual Influencer Intervention 2"** (feed_1's own intervention post + feed_2's 5 noise posts) and **`feed_8` "Stylised Virtual Influencer Intervention 2"** (feed_6's own intervention post + the same 5). Pure inserts — nothing existing modified. Feed `flags` were copied from the *original* feed (feed_1 / feed_6), not from feed_2; `checksum` is left NULL (the app sets it on the next admin publish — a first publish with no previous checksum never wipes participants). Ids are composite as usual (`proj_7::ig::feed_7::<post_id>`; the noise posts keep the same bare `post_id`s as in feed_1/2/6, the documented shared-template pattern).

**What "the updates" were** (diff of feed_2's noise posts vs feed_1/feed_6 before copying): only `author`, `body_text`, `author_type`, `avatar_url`, `image_mode`, `image` — every other column was already identical.

**Not done / worth knowing**: the new feeds are **not linked to any survey** — the study `survey_x3rpf08tbsmu5fzndh`'s experiment groups still point at the old feed ids, so the "2" feeds are unused until their `feed_sequence_ids` are changed. Pre-existing flag differences between arms were left as found (feed_2 has `realistic_pacing`/`realistic_surroundings`/`realistic_surroundings_avatars` on, feed_1 and feed_6 don't; feed_6 has *no* randomization flags at all while feed_1 randomizes names/avatars/bios/times) — copies inherit their original's, so the confound carries over unchanged.

**Verified** via the public read API after the write: all 3 source feeds' posts and all 9 pre-existing `proj_7` feed rows byte-identical to a pre-write snapshot (including timestamps); each new feed has exactly 6 posts (sort_order 0–5), its intervention post equal to the original feed's in every column, the 5 noise posts equal to feed_2's in every column, well-formed composite ids, and flags equal to the original feed's. **Not verified**: the new feeds rendered as a participant would see them, or opened in the admin UI.

## Real gap fixed: Instagram's admin Feed Preview never showed "Realistic surroundings" (2026-09-20)

Direct report: Instagram feed preview didn't show the surroundings even with the toggle on. Root cause: the preview (`FeedPreviewModal`) mounts only `Feed`. Facebook's and X's `Feed` render their own rails (`showRails` prop, default true), but Instagram's rails/topbar/pill lived only in a local, unexported `PageWithRails` inside `App-instagram.jsx` (built 2026-08-22 — the `IGFeed` "renders no rail markup" note in that entry was true, and is exactly why the preview was missed) — so only the real participant page could ever show them.

**Fix**: the rails (ghost skeleton pieces `RailBox`/`RailBanner`/`RailList`/`RailStack` + the real-content nav / "Suggested for you" + seeded suggestion effect) moved out of `App-instagram.jsx` into `ui-posts-instagram.jsx` as an exported **`InstagramSurroundings`** (the old `PageWithRails`, same JSX/CSS). IG `Feed` gained `showRails = true` and wraps itself in it by default — same pattern as Facebook/X. `App-instagram.jsx` now renders `<InstagramSurroundings … floatingPill>` around `<IGFeed showRails={false}>`, so the participant page still draws exactly one set of rails. The floating Messages pill is behind a new opt-in `floatingPill` prop (participant page only): it's `position:fixed`, so in the preview modal it would cover the whole admin page. Top bar is also not part of the preview (it's rendered separately by `RouteAwareTopbar` in the App, same as before).

**Behaviour change worth knowing**: a standalone IG `Feed` mount (the preview) now shows the **ghost skeleton rails when surroundings are off** — same as what a participant sees, and same as Facebook's preview already did — instead of no rails at all. **Keep in sync**: any change to Instagram's rails now goes in `InstagramSurroundings` only (one place, used by both).

**Verified live** (dev server, avatar-pool fetch stubbed): the real `FeedPreviewModal` at 1440px with `realistic_surroundings`+`_avatars` on — 9 nav items left, 5 "Suggested for you" rows with photos + "See all" right, 2 posts, no pill (screenshotted); off → ghost rails both sides; on without the avatars sub-toggle → 5 blank-circle suggestions, 0 photos; participant wiring (`InstagramSurroundings floatingPill` around `Feed showRails={false}`) → exactly one grid/one set of rails, pill 24px from the right edge. Both files parse clean; a fresh `?app=ig` load runs the edited `App-instagram.jsx` (renders the app's own bad-feed-id 404) with no new error. Rails are hidden by the existing CSS at narrow widths (~800px pane showed feed only) — same as the real page, not a preview bug. **Not verified**: the real admin modal in the logged-in Feeds UI, or a real participant run of a real IG feed.

## New: Instagram avatar framing (crop/zoom) so wide logos are legible in the circle (2026-09-20)

Direct report with two real brand logos (320×222 / 320×213 wide lockups, e.g. "Capital Observer") used as an Instagram post's avatar: in the feed they were "barely readable" and read as AI-style fake text. Root cause was not a bug: the avatar is a 34px circle with `object-fit:cover`, so a wide image is scaled to the circle's height and **centre-cropped** (mic + last letter clipped) while the whole wordmark is squeezed into ~34px. Considered and rejected "fit the whole image" (`contain`): it shows everything but makes the text *smaller* (~3px) — strictly worse for legibility. The real lever is choosing which part of the image fills the circle.

**Built (Instagram only, per the user)**: per-post `posts.avatar_crop jsonb` (`20260801000044_add_avatar_crop.sql`, nullable, additive; **applied to both Supabase projects before any code**) holding `{focalX 0–100, focalY 0–100, zoom 1–4}` — deliberately the same shape the Instagram post-image cropper already stores, so it reuses `getImageCropStyle`. Maps to `post.avatarCrop` in `mapPostRowToRaw`/`mapRawPostToRow`; `normalizeAvatarCrop` (`utils-core.js`) sanitizes both ways and returns **null for the exact default (50/50/1)**, so nothing is stored or rendered differently for any existing post. **Admin**: the previously-private `ImageCropper` (`components-admin-media-instagram.jsx`) is now exported and gained a `round` prop (circular 240px frame = exactly what participants see); the Instagram editor's Profile Photo section shows it as "Frame the photo" when the avatar is a real http(s) URL (Upload/URL mode). It resets (`avatarCrop: null`) when the image URL is edited, a new file is uploaded, or the mode changes away from an uploaded/URL image — a stale framing can't linger on a different picture. **Render**: new `CropAvatar` (`src/ui-posts/ui-avatar-crop.jsx`; no crop = the identical plain circular `<img>` as before; with a crop = a clipping circle wrapper, needed because the crop is a `transform` and a scaled `<img>` would spill outside its own rounded corners) used at every place Instagram draws the post's own avatar: comment-modal header + body (32px), desktop `BioHoverCard` (60px), `MobileBioSheet` (60px, reads it from `displayBio.avatarCrop` — that sheet ignores its own `avatarUrl` prop and uses the `post` object), and the feed header (34px, inlined since it carries the bio-hover ref/handlers). **Randomization**: crop applies only when the *displayed* avatar is the post's own (`randAvatarOn` false, i.e. randomization off or the post excludes "avatar" via `randomize_exclude`); a randomized pool avatar is never re-cropped. The 32px commenter avatars in the comment modal are neutral placeholders, deliberately untouched.

**Honest limit worth telling researchers**: framing can't make a wide *wordmark* legible in ~34px (a 12-letter one-line name is still ~2–3px per letter). It works when the admin frames a stacked name block or an icon/mark; the durable fix is uploading a square-designed logo. The editor hint says so.

**Verified**: Node — 12 checks on the real `normalizeAvatarCrop` and the real bundled `mapRawPostToRow`/`mapPostRowToRaw` (default→null, clamping, JSON string, junk, write/read round-trip, legacy row without the column). Live DB — rolled-back transaction on production stored `{focalX 88, focalY 50, zoom 1.5}` and returned it, default NULL, zero leftovers. Live UI with the user's two real logos: unframed posts still render the original plain `<img>` (34px, `object-position 50% 50%`, no transform); framed on the stacked text, "CAPITAL / OBSERVER" reads clearly vs a tiny sliver before; the second logo framed on its sun mark reads as a clean logo; both bio cards render the framed 60px avatar; randomized post → pool avatar with no wrapper, `randomize_exclude:["avatar"]` post → own logo with crop. Real Instagram `AdminPostEditor` mounted: round 240px frame appears, real `+`/arrow/`0` key events update `avatarCrop` (zoom 1.728 → nudge focalX 46 → reset null) and the live preview switches to the framed avatar. **Not verified**: dragging/pinching the cropper by hand (only keyboard events were driven, though it's the same component the post-image cropper already uses), a real S3 upload through the editor, the comment-modal avatars visually, Safari, or a real logged-in save to a real feed. **Not done**: Facebook and X have the same centre-crop behaviour for wide avatars (not requested); the editor's first framing of an existing wide-logo post still has to be done by hand per post.

## Real bug fixed: the admin "session expired" flow fired for sessions that were still renewable (2026-09-20)

Direct report: the admin session "keeps expiring so fast all the time." Not a server-lifetime problem first — a **two-clocks bug** in the app's own auth layer (the Supabase project's JWT/session settings were not readable from here; see "Not done").

**Root cause.** The app keeps its own localStorage *mirror* of the Supabase session (`admin_token_v1` + `admin_token_exp_v1`, plus role/email/username/AI flag — `utils-backend.js` ~3337) and every `getAdmin*()` getter, the expiry banner/overlay (`startSessionWatch`), and `hasAdminSession()` read only that mirror. But the mirror holds just the **access token's** expiry (~1h), while supabase-js separately persists a long-lived **refresh token** and silently mints new access tokens (at ~90s before expiry, and on tab-visible). Three consequences, all reproduced live against the real functions with a mocked Supabase endpoint:
1. **Returning after >1h (idle tab, laptop sleep, restart)**: `App-*.jsx` decided "logged in?" with `if (onAdmin && hasAdminSession())` — the mirror only. Lapsed → login form, and `getAdminToken()`'s expiry check even *wiped* the mirror, although the SDK still held a perfectly good refresh token. This is the big one — every return after an hour meant a full re-login.
2. **Mirror drift while the tab is open**: the SDK renewed the token but the mirror kept the old expiry until the dashboard's next 4-minute poll, so the "session expiring" banner / "expired" overlay (and `getAdminToken()` wiping the mirror → failed saves) could fire for a session the SDK had already renewed.
3. **Only the dashboard had any keep-alive at all** — the project picker, platform picker and Users page (outside `AdminDashboard`) had none, so they lapsed ~1h after login regardless.

**Fix (all client-side; no schema/Edge Function change).**
- `restoreAdminSession()` (`utils-backend.js`): rebuilds the full mirror from the SDK via the existing `touchAdminSession()` (SDK `getSession()` → refresh-token renewal → profile refetch → `setAdminSession`). Each `App-{facebook,instagram,amazon,x}.jsx` restore effect now tries it before showing the login form, guarded by a new `adminRestoring` state passed to `AdminEntry`, which renders nothing meanwhile (no login-form flash). Signed-out visitors: `getSession()` is local, no network, login shows immediately.
- `startAdminSessionSync()` + `supabaseOnAuthChange()` (`utils-backend-supabase.js`): subscribes to the SDK's `onAuthStateChange` and, on `TOKEN_REFRESHED`/`SIGNED_IN`/`USER_UPDATED`, copies the new access token + `expires_at` into an **existing** mirror the instant the SDK renews (also fires across tabs); `SIGNED_OUT` clears it. It deliberately never creates a partial mirror without role/email (only `touchAdminSession()` builds a full one), and the callback stays synchronous (the SDK holds an internal lock during it). Started from `AdminEntry` (`useEffect`), so it covers **every** admin page, not just the dashboard; idempotent.
- `startSessionWatch` gained optional `tryRenew`: before showing the expiring/expired UI it attempts a silent renewal (held UI while in flight, retried at most every 15s), and only surfaces the warning/overlay if renewal genuinely fails (refresh token expired, signed out elsewhere, disabled account, offline). The dashboard passes `touchAdminSession` as `tryRenew`. Without `tryRenew`, behaviour is unchanged.

**What still expires it, by design**: a session the *server* has ended — the Supabase project's refresh-token lifetime / "Time-box user sessions" / "Inactivity timeout" (Auth → Sessions, latter two Pro-plan features), a disabled account, sign-out in another tab, or password change. **Those are security settings and were not read or changed** (no `config.toml` in the repo; they live in the Supabase dashboard). If sessions still die at a fixed interval after this ships, that's where to look; JWT expiry (Project Settings → API/JWT, default 1h) no longer matters much now that the refresh token keeps it alive.

**Verified live** (dev server, real functions, only the Supabase `/auth/v1/token`, `/rest/v1/profiles`, `/auth/v1/logout` endpoints mocked): lapsed mirror + valid refresh token → old check `hasAdminSession()===false` (and it wiped the mirror), `restoreAdminSession()` → true after exactly one refresh + one profile call, full mirror rebuilt (new token, +3600s, role `owner`, email/username). SDK self-refresh with **no app poll** → mirror token/expiry followed immediately, role/email kept, no partial mirror created when none existed, `SIGNED_OUT` cleared it, `startAdminSessionSync` idempotent. `startSessionWatch`, 9 scenarios: renewal succeeds (expired / 30s-left / slow 600ms) → no warning UI ever; renewal fails → `expired`/`expiring` still surface; retry throttled to 1 attempt; healthy session → no renewal attempted; throws → treated as failure; no `tryRenew` → old behaviour. `AdminEntry` renders nothing while `adminRestoring`, the login form otherwise. Signed-out `restoreAdminSession()` → false, zero network calls. `/admin?app={ig,fb,x,amz}` all boot the edited Apps and show the login form when signed out. **Not verified**: a real >1h idle session against the real Supabase (the mock proves the app-side logic, not the server's refresh-token policy), the actual `AdminEntry`→dashboard path after a restore inside a full `App-*.jsx` boot (parse-checked + the pieces above tested separately; no admin login available), or multi-tab behaviour beyond the SDK's own broadcast.
