// utils-backend-supabase.js
// Phase 4 scaffolding (see CLAUDE.md "Backend migration: Apps Script/Sheets
// -> Supabase"). Only reached when VITE_BACKEND=supabase — utils-backend.js
// dispatches to these functions and stores the result through the same
// localStorage-backed session helpers (setAdminSession/clearAdminSession)
// the GAS path already uses, so every synchronous getter that already
// exists (getAdminToken/getAdminRole/getAdminEmail/hasAdminSession) keeps
// working unchanged for both backends.
//
// Deliberately returns plain {ok, ...} result objects rather than calling
// setAdminSession itself, so this file has no dependency on
// utils-backend.js (avoids a circular import between the two).
import { getSupabaseClient } from "./utils-supabase-client";

async function fetchAdminProfile(supabase, userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, disabled, email, username")
    .eq("id", userId)
    .single();

  if (error || !data) return { profile: null, err: error?.message || "No admin profile for this account" };
  return { profile: data, err: null };
}

function ttlSecFromExpiresAt(expiresAt) {
  const n = Number(expiresAt || 0);
  if (!n) return null;
  return Math.max(0, n - Math.floor(Date.now() / 1000));
}

export async function supabaseAdminSignIn(email, password) {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data?.session || !data?.user) {
      return { ok: false, err: error?.message || "Login failed" };
    }

    const { profile, err } = await fetchAdminProfile(supabase, data.user.id);
    if (!profile) {
      await supabase.auth.signOut();
      return { ok: false, err };
    }
    if (profile.disabled) {
      await supabase.auth.signOut();
      return { ok: false, err: "This admin account has been disabled" };
    }

    return {
      ok: true,
      token: data.session.access_token,
      ttlSec: ttlSecFromExpiresAt(data.session.expires_at),
      role: profile.role || "viewer",
      email: profile.email || data.user.email,
      username: profile.username || "",
    };
  } catch (e) {
    return { ok: false, err: String(e?.message || e) };
  }
}

export async function supabaseAdminSignOut() {
  try {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
  } catch {}
  return { ok: true };
}

// Called periodically by the dashboard's keep-alive tick (see
// components-admin-dashboard.jsx `keepAlive`). The Supabase SDK already
// silently rotates the access token via its own refresh token before it
// expires; this re-reads whatever session is currently live and re-derives
// a fresh ttlSec from it, so the locally-stored expiry (which drives the
// "session expiring" countdown UI) doesn't fall out of sync with a token
// the SDK already renewed underneath it.
export async function supabaseAdminTouch() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session) {
      return { ok: false, err: error?.message || "No active session" };
    }

    const { profile, err } = await fetchAdminProfile(supabase, data.session.user.id);
    if (!profile) return { ok: false, err };
    if (profile.disabled) {
      await supabase.auth.signOut();
      return { ok: false, err: "This admin account has been disabled" };
    }

    return {
      ok: true,
      token: data.session.access_token,
      ttlSec: ttlSecFromExpiresAt(data.session.expires_at),
      role: profile.role || "viewer",
      email: profile.email || data.session.user.email,
      username: profile.username || "",
    };
  } catch (e) {
    return { ok: false, err: String(e?.message || e) };
  }
}

// `feeds.id` is a synthetic `<project_id>::<app>::<feed_id>` key, not the
// bare feed_id — see supabase/README.md "Design decisions" and migration
// 20260801000011_fix_feed_id_collisions.sql (real feed_ids like "feed_1"
// repeat across different projects/apps, so the bare id isn't unique).
// Every table that references a feed (posts, participants, feed_surveys)
// stores this composed form.
export function composeFeedId(projectId, app, feedId) {
  return `${projectId}::${app}::${feedId}`;
}

export async function supabaseListProjects() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, notes")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data || []).map((row) => ({
    project_id: row.id,
    name: row.name,
    notes: row.notes ?? "",
  }));
}

// Reverses mapPost() in supabase/scripts/migrate-from-sheets.mjs field for
// field, so a post round-trips through Supabase in exactly the raw shape
// loadPostsFromBackend has always returned (the shape ui-posts-*.jsx and
// the post editors consume directly — this is intentionally NOT a fresh
// camelCase convention, it matches the historical GAS/Sheets field names
// verbatim, including the two fields that were already snake_case there:
// bio_text/bio_url/bio_posts/bio_followers/bio_following).
function mapPostRowToRaw(row) {
  return {
    // row.id is the internal composed "<feed_id>::<post_id>" key
    // (20260801000013_fix_post_id_collisions.sql) — the frontend always
    // gets the bare original post_id back, same asymmetry as
    // supabaseListFeeds returning feed_id (bare) rather than id (composed).
    id: row.post_id,
    postName: row.post_name ?? "",
    author: row.author ?? "",
    time: row.post_time ?? "",
    text: row.body_text ?? "",
    links: Array.isArray(row.links) ? row.links : [],

    badge: !!row.badge,
    authorType: row.author_type ?? "",
    topic: row.topic ?? "",

    showBio: !!row.show_bio,
    bio_text: row.bio_text ?? "",
    bio_url: row.bio_url ?? "",
    bio_posts: row.bio_posts ?? null,
    bio_followers: row.bio_followers ?? null,
    bio_following: row.bio_following ?? null,

    avatarMode: row.avatar_mode ?? "",
    avatarRandomKind: row.avatar_random_kind ?? "",
    avatarUrl: row.avatar_url ?? "",

    imageMode: row.image_mode ?? "",
    image: row.image ?? null,
    images: Array.isArray(row.images) ? row.images : [],
    imageTopic: row.image_topic ?? "",
    videoMode: row.video_mode ?? "",
    video: row.video ?? null,
    videoPosterUrl: row.video_poster_url ?? "",
    videoAutoplayMuted: !!row.video_autoplay_muted,
    videoShowControls: row.video_show_controls !== false,
    videoLoop: !!row.video_loop,
    showGhostComments: !!row.show_ghost_comments,

    interventionType: row.intervention_type || "none",
    noteText: row.note_text ?? "",
    noteMetaEnabled: !!row.note_meta_enabled,
    noteReaderGroups: Array.isArray(row.note_reader_groups) ? row.note_reader_groups : [],
    noteReaderGroup2Enabled: !!row.note_reader_group2_enabled,

    showReactions: row.show_reactions !== false,
    selectedReactions: Array.isArray(row.selected_reactions) ? row.selected_reactions : [],
    reactions: row.reactions && typeof row.reactions === "object" ? row.reactions : {},
    metrics: row.metrics && typeof row.metrics === "object" ? row.metrics : {},

    adType: row.ad_type || "none",
    adDomain: row.ad_domain ?? "",
    adHeadline: row.ad_headline ?? "",
    adSubheadline: row.ad_subheadline ?? "",
    adButtonText: row.ad_button_text ?? "",
    adUrl: row.ad_url ?? "",

    newsDomain: row.news_domain ?? "",
    newsHeadline: row.news_headline ?? "",
    newsDescription: row.news_description ?? "",
    newsUrl: row.news_url ?? "",
  };
}

// Backs loadPostByIdFromBackend's Supabase branch (survey post_reminder
// questions) — a single post by its bare post_id within one feed. Uses the
// same feed_id+post_id lookup the unique index
// (20260801000013_fix_post_id_collisions.sql) enforces, so this can't
// return the wrong feed's copy of a shared post id.
export async function supabaseLoadPostById({ projectId, app, feedId, postId }) {
  const supabase = getSupabaseClient();
  const composedFeedId = composeFeedId(projectId, app, feedId);

  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("feed_id", composedFeedId)
    .eq("post_id", postId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapPostRowToRaw(data) : null;
}

export async function supabaseLoadPosts({ projectId, feedId, app }) {
  const supabase = getSupabaseClient();
  const composedFeedId = composeFeedId(projectId, app, feedId);

  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("feed_id", composedFeedId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);

  return (data || []).map(mapPostRowToRaw);
}

export async function supabaseListFeeds({ projectId, app }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("feeds")
    .select("feed_id, name, checksum, flags")
    .eq("project_id", projectId)
    .eq("app", app)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  // flags is real jsonb here (already a parsed object via PostgREST),
  // unlike the GAS path where it arrives as a JSON *string* — see
  // supabase/README.md "Phase 3" for why that distinction mattered there.
  return (data || []).map((row) => ({
    feed_id: row.feed_id,
    name: row.name,
    checksum: row.checksum || "",
    flags: row.flags && typeof row.flags === "object" ? row.flags : {},
  }));
}

export async function supabaseListSurveys({ projectId }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("surveys")
    .select("id, name, status")
    .eq("project_id", projectId)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data || []).map((row) => ({
    survey_id: row.id,
    name: row.name,
    status: row.status,
  }));
}

// `surveys.definition` is already the exact raw shape loadSurveyFromBackend
// has always returned (see save-survey/index.ts's frontendSurveyToBackend —
// it writes survey_id/name/status/pages/page_blocks/etc as top-level keys of
// that same jsonb blob), so this is a near-passthrough rather than a
// field-by-field remap like posts needed — except experiment_groups, which
// migration 20260801000015_experiment_groups_and_custom_measure_groups_tables.sql
// moved into its own table (the sole source of truth save-survey and
// assign_experiment_group both read/write now); merged back onto the
// returned object here so every existing consumer of survey.experiment_groups
// keeps working completely unchanged.
export async function supabaseLoadSurveyDefinition({ surveyId }) {
  const supabase = getSupabaseClient();
  const [{ data, error }, { data: groupRows, error: groupErr }] = await Promise.all([
    supabase.from("surveys").select("id, definition").eq("id", surveyId).maybeSingle(),
    supabase
      .from("experiment_groups")
      .select("id, name, feed_sequence_ids")
      .eq("survey_id", surveyId)
      .order("sort_order", { ascending: true }),
  ]);

  if (error) throw new Error(error.message);
  if (groupErr) throw new Error(groupErr.message);
  if (!data) return null;

  return {
    ...(data.definition || {}),
    survey_id: data.definition?.survey_id || data.id,
    experiment_groups: (groupRows || []).map((row) => ({
      id: row.id,
      name: row.name,
      feed_sequence_ids: Array.isArray(row.feed_sequence_ids) ? row.feed_sequence_ids : [],
    })),
  };
}

// Replaces getLinkedFeedIdsForSurveyFromBackend's N-requests-per-feed GAS
// lookup (one FEED_SURVEY_GET_URL call per candidate feed) with a single
// query against the feed_surveys join table. feed_surveys.feed_id stores
// the composed <project_id>::<app>::<feed_id> key (see composeFeedId
// above), so linked ids for feeds outside this project/app are filtered
// out by prefix before stripping it back to the bare feed_id the rest of
// the app expects.
export async function supabaseGetLinkedFeedIds({ surveyId, projectId, app }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("feed_surveys").select("feed_id").eq("survey_id", surveyId);

  if (error) throw new Error(error.message);

  const prefix = composeFeedId(projectId, app, "");
  return (data || [])
    .map((row) => row.feed_id)
    .filter((id) => typeof id === "string" && id.startsWith(prefix))
    .map((id) => id.slice(prefix.length));
}

// Backs linkSurveyToFeedsOnBackend's Supabase branch ("Save feed links" in
// the survey editor — a standalone action, separate from saving the survey
// itself). GAS models this as direct link/unlink actions against a
// FeedSurveys sheet; Supabase instead derives feed_surveys purely from the
// survey's own definition.feed_sequence_ids (see save-survey/index.ts) — the
// join table is never hand-edited independently of that field anywhere
// else. To keep this action consistent with that, and with a plain "Save
// survey" not silently reverting it on the next save, this writes BOTH: the
// feed_surveys rows directly (diffed, not full delete+reinsert, so this
// stays a lightweight update rather than a full survey re-save/re-sanitize)
// and definition.feed_sequence_ids/linked_feed_ids on the survey row itself.
export async function supabaseLinkSurveyToFeeds({ surveyId, feedIds, projectId, app }) {
  const supabase = getSupabaseClient();
  const desiredFeedIds = Array.from(new Set((feedIds || []).map((f) => String(f || "").trim()).filter(Boolean)));
  const prefix = composeFeedId(projectId, app, "");
  const composedDesired = desiredFeedIds.map((fid) => `${prefix}${fid}`);

  const { data: surveyRow, error: surveyErr } = await supabase
    .from("surveys")
    .select("definition")
    .eq("id", surveyId)
    .maybeSingle();
  if (surveyErr) throw new Error(surveyErr.message);
  if (!surveyRow) throw new Error("survey not found");

  const { data: currentLinks, error: linksErr } = await supabase
    .from("feed_surveys")
    .select("feed_id")
    .eq("survey_id", surveyId);
  if (linksErr) throw new Error(linksErr.message);

  const currentComposed = (currentLinks || [])
    .map((r) => r.feed_id)
    .filter((id) => typeof id === "string" && id.startsWith(prefix));
  const currentSet = new Set(currentComposed);
  const desiredSet = new Set(composedDesired);

  const toUnlink = currentComposed.filter((id) => !desiredSet.has(id));
  const toLink = composedDesired.filter((id) => !currentSet.has(id));

  if (toUnlink.length) {
    const { error } = await supabase
      .from("feed_surveys")
      .delete()
      .eq("survey_id", surveyId)
      .in("feed_id", toUnlink);
    if (error) throw new Error(error.message);
  }

  if (toLink.length) {
    const { error } = await supabase
      .from("feed_surveys")
      .insert(toLink.map((feed_id) => ({ feed_id, survey_id: surveyId })));
    if (error) {
      // 23503 = foreign_key_violation. The client-side picker (Survey
      // editor's Feed Setup tab) already blocks this by checking each
      // feed's `updated_at`, but this is real production data (see
      // CLAUDE.md for the incident it was found from) — worth a friendly
      // message here too rather than trusting that check is the only path
      // that can ever reach this insert.
      if (error.code === "23503") {
        throw new Error(
          "One or more selected feeds haven't been saved yet — open each in Feeds and click \"Save feed\" first, then try again."
        );
      }
      throw new Error(error.message);
    }
  }

  const updatedDefinition = {
    ...(surveyRow.definition || {}),
    feed_sequence_ids: desiredFeedIds,
    linked_feed_ids: desiredFeedIds,
  };
  const { error: updateErr } = await supabase
    .from("surveys")
    .update({ definition: updatedDefinition })
    .eq("id", surveyId);
  if (updateErr) throw new Error(updateErr.message);

  return {
    linked_feed_ids: desiredFeedIds,
    added_feed_ids: toLink.map((id) => id.slice(prefix.length)),
    removed_feed_ids: toUnlink.map((id) => id.slice(prefix.length)),
  };
}

// Calls the deployed save-survey Edge Function (supabase/functions/
// save-survey) rather than a plain upsert — it does server-side
// normalization/sanitization of the definition plus the two-table sync
// (surveys row + feed_surveys links) in one place, same reasoning as
// Code.gs's sanitizeSurveyDef_/handleSaveSurvey_ on the GAS side. The
// Supabase client automatically attaches the signed-in admin's JWT as the
// Authorization header for functions.invoke, so no admin_token-equivalent
// needs to be passed explicitly.
export async function supabaseSaveSurvey({ survey, projectId, app }) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.functions.invoke("save-survey", {
    body: { definition: survey, project_id: projectId, app },
  });

  if (error) {
    let msg = error.message || String(error);
    try {
      const body = await error.context?.json?.();
      if (body?.err) msg = body.err;
    } catch {}
    return { ok: false, err: msg };
  }

  if (!data?.ok) return { ok: false, err: data?.err || "save failed" };

  return { ok: true, survey_id: data.survey_id, checksum: null };
}

// Reverses mapPostRowToRaw() above (and mirrors mapPost() in
// supabase/scripts/migrate-from-sheets.mjs), turning a raw camelCase post
// object — the shape the post editors/ui-posts-*.jsx produce and consume —
// into a public.posts row.
function mapRawPostToRow(raw, composedFeedId, sortOrder) {
  const postId = String(raw.id);
  return {
    // Composed the same way as the migration/repair scripts and
    // 20260801000013_fix_post_id_collisions.sql — post ids are only unique
    // within the feed they were created in (real study designs duplicate a
    // template feed into Control/Treatment variants, keeping the shared
    // base posts' bare ids identical across all of them), so the DB primary
    // key must include feed_id or a later publish silently steals an
    // earlier feed's identically-numbered post row.
    id: `${composedFeedId}::${postId}`,
    post_id: postId,
    feed_id: composedFeedId,
    sort_order: sortOrder,

    post_name: raw.postName ?? raw.name ?? null,
    author: raw.author ?? null,
    post_time: raw.time ?? null,
    body_text: raw.text ?? null,
    links: Array.isArray(raw.links) ? raw.links : [],

    badge: !!raw.badge,
    author_type: raw.authorType ?? null,
    topic: raw.topic ?? null,

    show_bio: !!raw.showBio,
    bio_text: raw.bio_text ?? null,
    bio_url: raw.bio_url ?? null,
    bio_posts: Number.isFinite(raw.bio_posts) ? raw.bio_posts : null,
    bio_followers: Number.isFinite(raw.bio_followers) ? raw.bio_followers : null,
    bio_following: Number.isFinite(raw.bio_following) ? raw.bio_following : null,

    avatar_mode: raw.avatarMode ?? null,
    avatar_random_kind: raw.avatarRandomKind ?? null,
    avatar_url: raw.avatarUrl ?? null,

    image_mode: raw.imageMode ?? null,
    image: raw.image ?? null,
    images: Array.isArray(raw.images) ? raw.images : [],
    image_topic: raw.imageTopic ?? null,
    video_mode: raw.videoMode ?? null,
    video: raw.video ?? null,
    video_poster_url: raw.videoPosterUrl ?? null,
    video_autoplay_muted: !!raw.videoAutoplayMuted,
    video_show_controls: raw.videoShowControls !== false,
    video_loop: !!raw.videoLoop,
    show_ghost_comments: !!raw.showGhostComments,

    intervention_type: raw.interventionType || "none",
    note_text: raw.noteText ?? null,
    note_meta_enabled: !!raw.noteMetaEnabled,
    note_reader_groups: Array.isArray(raw.noteReaderGroups) ? raw.noteReaderGroups : [],
    note_reader_group2_enabled: !!raw.noteReaderGroup2Enabled,

    show_reactions: raw.showReactions !== false,
    selected_reactions: Array.isArray(raw.selectedReactions) ? raw.selectedReactions : [],
    reactions: raw.reactions && typeof raw.reactions === "object" ? raw.reactions : {},
    metrics: raw.metrics && typeof raw.metrics === "object" ? raw.metrics : {},

    ad_type: raw.adType || "none",
    ad_domain: raw.adDomain ?? null,
    ad_headline: raw.adHeadline ?? null,
    ad_subheadline: raw.adSubheadline ?? null,
    ad_button_text: raw.adButtonText ?? null,
    ad_url: raw.adUrl ?? null,

    news_domain: raw.newsDomain ?? null,
    news_headline: raw.newsHeadline ?? null,
    news_description: raw.newsDescription ?? null,
    news_url: raw.newsUrl ?? null,
  };
}

// Not cryptographic — this checksum only needs to (a) change whenever post
// content changes and (b) stay stable when it doesn't, since it's used
// purely as a client-side cache-invalidation key (getCachedPosts/
// setCachedPosts in components-admin-dashboard.jsx) and as the "did this
// feed change" signal behind the "publishing a checksum-changing feed
// wipes its participants" warning. GAS computes its own opaque checksum
// server-side; there's no need to match its algorithm, only its contract.
function computeChecksum(value) {
  const str = JSON.stringify(value);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16);
}

// Mirrors GAS's publish_posts action: full-replace a feed's post list, and
// implicitly create/rename the feed row if needed — "+ New feed" in
// components-admin-dashboard.jsx only creates local React state (no
// backend call), so the feed row genuinely may not exist yet the first
// time this runs for a given feedId.
//
// Also enforces the project's "wipe on change" policy (projects.wipe_on_change,
// 20260801000012_project_wipe_on_change.sql): reads the feed's *previous*
// checksum before overwriting it, and if it existed and differs from the
// new one, wipes that feed's participants — but only when the project has
// opted in (default off). GAS's equivalent flag is global with no project
// scoping at all; this is a deliberate divergence, not a bug, per direct
// user request (see CLAUDE.md). A brand-new feed (no previous checksum) is
// never wiped — there's nothing to invalidate on a first publish.
export async function supabasePublishPosts({ posts, feedId, name, projectId, app }) {
  const supabase = getSupabaseClient();
  const composedFeedId = composeFeedId(projectId, app, feedId);
  const checksum = computeChecksum(posts);

  const [{ data: existingFeed }, { data: project }] = await Promise.all([
    supabase.from("feeds").select("checksum").eq("id", composedFeedId).maybeSingle(),
    projectId
      ? supabase.from("projects").select("wipe_on_change").eq("id", projectId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const { error: feedErr } = await supabase.from("feeds").upsert(
    {
      id: composedFeedId,
      project_id: projectId,
      app,
      feed_id: feedId,
      name: name || feedId,
      checksum,
    },
    { onConflict: "id" }
  );
  if (feedErr) throw new Error(feedErr.message);

  const checksumChanged = !!existingFeed?.checksum && existingFeed.checksum !== checksum;
  if (checksumChanged && project?.wipe_on_change) {
    const { error: wipeErr } = await supabase.from("participants").delete().eq("feed_id", composedFeedId);
    if (wipeErr) throw new Error(wipeErr.message);
  }

  const { error: deleteErr } = await supabase.from("posts").delete().eq("feed_id", composedFeedId);
  if (deleteErr) throw new Error(deleteErr.message);

  const rows = (posts || []).map((p, i) => mapRawPostToRow(p, composedFeedId, i));
  if (rows.length) {
    const { error: insertErr } = await supabase.from("posts").insert(rows);
    if (insertErr) throw new Error(insertErr.message);
  }

  return true;
}

// Project-scoped counterpart to GAS's global wipe_policy get/set actions
// (see supabasePublishPosts above for why this diverges from global scope).
export async function supabaseGetWipePolicy({ projectId }) {
  if (!projectId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("projects")
    .select("wipe_on_change")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? !!data.wipe_on_change : null;
}

export async function supabaseSetWipePolicy({ projectId, wipeOnChange }) {
  if (!projectId) throw new Error("projectId required");
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("projects")
    .update({ wipe_on_change: !!wipeOnChange })
    .eq("id", projectId)
    .select("wipe_on_change")
    .single();
  if (error) throw new Error(error.message);
  return !!data.wipe_on_change;
}

export async function supabaseDeleteSurvey({ surveyId }) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("surveys").delete().eq("id", surveyId);
  if (error) throw new Error(error.message);
  return true;
}

export async function supabaseCreateProject({ projectId, name, notes }) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("projects").insert({
    id: projectId,
    name: name || projectId,
    notes: notes || null,
  });
  if (error) throw new Error(error.message);
  return true;
}

export async function supabaseDeleteProject({ projectId }) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw new Error(error.message);
  return true;
}

export async function supabaseDeleteFeed({ projectId, app, feedId }) {
  const supabase = getSupabaseClient();
  const composedFeedId = composeFeedId(projectId, app, feedId);
  const { error } = await supabase.from("feeds").delete().eq("id", composedFeedId);
  if (error) throw new Error(error.message);
  return true;
}

// Mirrors GAS's wipe_participants action ("delete the participants sheet for
// this feed"): a hard delete of every participants row for one feed, nothing
// else (survey_responses is a separate table/action, not touched here).
// participants.feed_id is the same composed <project>::<app>::<feed> key
// feeds.id uses, so no join is needed.
export async function supabaseWipeParticipants({ projectId, app, feedId }) {
  const supabase = getSupabaseClient();
  const composedFeedId = composeFeedId(projectId, app, feedId);
  const { error } = await supabase.from("participants").delete().eq("feed_id", composedFeedId);
  if (error) throw new Error(error.message);
  return true;
}

export async function supabaseFetchFeedFlags({ projectId, app, feedId }) {
  const supabase = getSupabaseClient();
  const composedFeedId = composeFeedId(projectId, app, feedId);
  const { data, error } = await supabase.from("feeds").select("flags").eq("id", composedFeedId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.flags && typeof data.flags === "object" ? data.flags : {};
}

// Read-modify-write, not a blind overwrite — the admin dashboard's per-flag
// toggle (components-admin-dashboard.jsx `toggleFlag`) only ever sends a
// one-key patch (e.g. `{random_avatar: true}`), and feeds.flags stores the
// canonical randomize_* shape (normalizeFlags() in migrate-from-sheets.mjs),
// not the legacy random_* one the patch itself uses — merging with a plain
// `{...existing, ...patch}` spread would leave both an old `randomize_avatars`
// and a new `random_avatar` key sitting side by side, with
// normalizeFlagsForRead's `??` silently preferring the stale canonical one.
// FLAG_PAIRS resolves each flag's *either*-naming patch value against its
// canonical key explicitly, and leaves every flag the patch didn't mention
// untouched — deliberately not reusing normalizeFlagsForRead/-ForStore from
// utils-backend.js here, since this file stays a one-directional dependency
// of that one (see header comment), not the other way around.
const FLAG_PAIRS = [
  ["randomize_times", "random_time"],
  ["randomize_avatars", "random_avatar"],
  ["randomize_names", "random_name"],
  ["randomize_images", "random_image"],
  ["randomize_bios", "random_bio"],
  // No legacy alias — these postdate GAS, only one name each ever existed.
  // Kept as three independent flags (not bundled into one "realism" switch)
  // per direct instruction: a researcher must be able to turn each on/off
  // separately per feed, nothing should become standard/always-on.
  ["realistic_engagement", "realistic_engagement"],
  ["realistic_engagement_randomize", "realistic_engagement_randomize"],
  ["realistic_engagement_comments", "realistic_engagement_comments"],
  ["realistic_pacing", "realistic_pacing"],
  ["realistic_surroundings", "realistic_surroundings"],
  ["realistic_surroundings_avatars", "realistic_surroundings_avatars"],
  ["allow_dark_mode", "allow_dark_mode"],
];

export async function supabaseSetFeedFlags({ projectId, app, feedId, patch }) {
  const supabase = getSupabaseClient();
  const composedFeedId = composeFeedId(projectId, app, feedId);

  const { data: existing, error: readErr } = await supabase
    .from("feeds")
    .select("flags")
    .eq("id", composedFeedId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);

  const merged = { ...(existing?.flags && typeof existing.flags === "object" ? existing.flags : {}) };
  for (const [canonical, legacy] of FLAG_PAIRS) {
    if (patch && (typeof patch[canonical] !== "undefined" || typeof patch[legacy] !== "undefined")) {
      merged[canonical] = !!(patch[canonical] ?? patch[legacy]);
    }
  }
  // Admin-only string metadata (a feed's short label for CSV column
  // headers) — not one of FLAG_PAIRS' booleans, so handled separately
  // rather than forced through `!!()`.
  if (patch && typeof patch.csv_name !== "undefined") {
    merged.csv_name = String(patch.csv_name || "").trim();
  }

  const { data, error } = await supabase
    .from("feeds")
    .update({ flags: merged })
    .eq("id", composedFeedId)
    .select("flags")
    .single();
  if (error) throw new Error(error.message);
  return data.flags;
}

/* ===================== Participant-facing survey delivery =================
 * Public reads (surveys_select_public / feed_surveys_select_public RLS —
 * no admin session involved, same as a real participant's anonymous
 * browser). getSurveyForFeedFromBackend/getSurveyFromBackend in
 * utils-backend.js wrap these with the same normalization regardless of
 * which backend answered, so these only need to return the raw shape.
 */

// One feed_id can only be linked to the survey it was included in via
// feed_sequence_ids at save time (handleSaveSurvey_'s "link every feed"
// behavior, mirrored by save-survey/index.ts) — first match wins, matching
// FEED_SURVEY_GET_URL's single-link-per-feed contract on the GAS side.
export async function supabaseGetSurveyIdForFeed({ feedId, projectId, app }) {
  const supabase = getSupabaseClient();
  const composedFeedId = composeFeedId(projectId, app, feedId);
  const { data, error } = await supabase
    .from("feed_surveys")
    .select("survey_id")
    .eq("feed_id", composedFeedId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.survey_id || null;
}

// `trigger` is set by the survey editor (defaults to "after_feed_submit")
// but frontendSurveyToBackend (supabase/functions/_shared/survey-sanitize.ts)
// doesn't currently include it in the persisted definition — a pre-existing
// gap in the Phase 2 port, not introduced here. Every survey in practice
// uses the default, so this falls back the same way
// getSurveyForFeedFromBackend's own wrapper already does downstream.
function derivePrefaceFields(definition) {
  const hasParticipantInfo = !!String(definition?.participant_information_html || "").trim();
  const hasConsent = !!String(definition?.consent_text_html || "").trim();
  const hasInstructions = !!String(definition?.instructions_html || "").trim();

  return {
    has_preface: hasParticipantInfo || hasConsent || hasInstructions,
    preface: {
      participant_information: hasParticipantInfo,
      consent: hasConsent,
      instructions: hasInstructions,
    },
  };
}

export async function supabaseGetSurveyBootForFeed({ feedId, projectId, app }) {
  const surveyId = await supabaseGetSurveyIdForFeed({ feedId, projectId, app });
  if (!surveyId) return { has_survey: false };

  const definition = await supabaseLoadSurveyDefinition({ surveyId });
  if (!definition) return { has_survey: false };

  return {
    ...definition,
    has_survey: true,
    preferred_feed_id: "",
    ...derivePrefaceFields(definition),
  };
}

export async function supabaseGetSurveyBootById({ surveyId }) {
  const definition = await supabaseLoadSurveyDefinition({ surveyId });
  if (!definition) return null;

  return {
    ...definition,
    has_survey: true,
    preferred_feed_id: "",
    ...derivePrefaceFields(definition),
  };
}

/* ===================== Experiment groups ==================================
 * assign_experiment_group is grantEXECUTE'd to anon+authenticated (see
 * migration 20260801000008) — no session required, matching participant-
 * facing usage. reset_experiment_group_assignments checks
 * is_admin_writer() via auth.uid() internally, so it only succeeds when
 * called through the signed-in admin's client (which supabase.rpc already
 * attaches automatically).
 */
export async function supabaseAssignExperimentGroup({ surveyId, sessionId, participantId }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("assign_experiment_group", {
    p_survey_id: surveyId,
    p_session_id: sessionId,
    p_participant_id: participantId || null,
  });

  if (error) throw new Error(error.message);
  return data ? String(data) : null;
}

export async function supabaseResetExperimentGroupAssignments({ surveyId }) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("reset_experiment_group_assignments", { p_survey_id: surveyId });
  if (error) throw new Error(error.message);
  return true;
}

// experiment_assignments has no aggregate/count RPC — group counts are
// small in practice (bounded by participant count for one survey), so this
// just pulls the group_id column and tallies client-side rather than
// standing up a Postgres view for one admin-panel number.
export async function supabaseGetExperimentGroupCounts({ surveyId }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("experiment_assignments").select("group_id").eq("survey_id", surveyId);
  if (error) throw new Error(error.message);

  const counts = {};
  let total = 0;
  for (const row of data || []) {
    const gid = row.group_id || "";
    counts[gid] = (counts[gid] || 0) + 1;
    total += 1;
  }
  return { counts, total };
}

// Custom measure groups (Survey Participants analysis hub, "custom
// tag-based measure groups" — CLAUDE.md). Previously localStorage-only, per
// browser, never synced across admins/machines — a real gap closed by
// migration 20260801000015_experiment_groups_and_custom_measure_groups_tables.sql.
// Admin-only (RLS has no public-select policy on this table, unlike
// experiment_groups — nothing participant-facing ever reads it).
export async function supabaseListCustomMeasureGroups({ surveyId }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("custom_measure_groups")
    .select("id, name, pattern, item_keys")
    .eq("survey_id", surveyId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);

  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    pattern: row.pattern || "",
    itemKeys: Array.isArray(row.item_keys) ? row.item_keys : [],
  }));
}

// Whole-array delete + reinsert, same lightweight-sync idiom as
// feed_surveys/experiment_groups above — the admin analysis hub always
// persists the full group list at once (add/edit/delete all go through the
// same setGroups(next) call), so there's no concurrent-editor case to diff
// against.
export async function supabaseSaveCustomMeasureGroups({ surveyId, groups }) {
  const supabase = getSupabaseClient();
  const safeGroups = Array.isArray(groups) ? groups : [];

  const { error: deleteErr } = await supabase.from("custom_measure_groups").delete().eq("survey_id", surveyId);
  if (deleteErr) throw new Error(deleteErr.message);

  if (safeGroups.length) {
    const { error: insertErr } = await supabase.from("custom_measure_groups").insert(
      safeGroups.map((group, index) => ({
        id: group.id,
        survey_id: surveyId,
        name: group.name || "",
        pattern: group.pattern || "",
        item_keys: Array.isArray(group.itemKeys) ? group.itemKeys : [],
        sort_order: index,
      }))
    );
    if (insertErr) throw new Error(insertErr.message);
  }

  return true;
}

/* ===================== Participant submission (writes) ====================
 * Uses a direct keepalive fetch against PostgREST rather than the
 * supabase-js client, mirroring the existing sendBeacon-first/fetch-fallback
 * pattern in utils-backend.js: these calls frequently fire during page
 * unload (participant closes the tab right after submitting), and
 * `keepalive: true` is the modern, header-capable equivalent of
 * navigator.sendBeacon (which can't carry the apikey header PostgREST
 * requires). Both tables are public-insert via RLS — anon key only, no
 * admin session involved, matching a real participant's anonymous browser.
 */
async function supabaseInsert(table, row) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${String(url).replace(/\/+$/, "")}/rest/v1/${table}`, {
    method: "POST",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(`supabaseInsert(${table}) failed: HTTP ${res.status} ${text}`);
  }

  return res.ok;
}

export async function supabaseLogParticipant({ row, feedId, surveyId, projectId, app }) {
  const fixedKeys = new Set([
    "session_id", "participant_id", "prolific_pid", "prolific_session_id",
    "session_id_ext", "prolific_study_id", "study_id", "ip_address",
    "entered_at_iso", "entered_at", "submitted_at_iso", "submitted_at",
    "ms_enter_to_submit", "ms_enter_to_last_interaction",
    "feed_id", "survey_id", "feed_checksum", "project_id",
  ]);

  const extra = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (!fixedKeys.has(k)) extra[k] = v;
  }

  const dbRow = {
    project_id: projectId || null,
    feed_id: feedId ? composeFeedId(projectId, app, feedId) : null,
    survey_id: surveyId || row?.survey_id || null,
    feed_checksum: row?.feed_checksum ?? null,

    session_id: String(row?.session_id ?? row?.session_id_ext ?? ""),
    participant_id: row?.participant_id ?? null,
    prolific_pid: row?.prolific_pid ?? null,
    prolific_session_id: row?.prolific_session_id ?? row?.session_id_ext ?? null,
    prolific_study_id: row?.prolific_study_id ?? row?.study_id ?? null,
    ip_address: row?.ip_address ?? null,

    entered_at: row?.entered_at_iso || row?.entered_at || null,
    submitted_at: row?.submitted_at_iso || row?.submitted_at || null,
    ms_enter_to_submit: Number.isFinite(row?.ms_enter_to_submit) ? row.ms_enter_to_submit : null,
    ms_enter_to_last_interaction: Number.isFinite(row?.ms_enter_to_last_interaction)
      ? row.ms_enter_to_last_interaction
      : null,

    extra,
  };

  // feed_id is NOT NULL on participants — a feed-less (survey-only) entry
  // has no row to attach to under this schema. GAS's sheet-per-feed model
  // sidesteps this by keying the sheet itself; there's no Postgres
  // equivalent gap-filler without a schema change, so this specific case
  // is a known no-op rather than a silent wrong write.
  if (!dbRow.feed_id) return false;

  return supabaseInsert("participants", dbRow);
}

export async function supabaseLogSurveyResponse(args) {
  const dbRow = {
    survey_id: args.survey_id,
    feed_id:
      args.feed_id && args.feed_id !== "SURVEY_ONLY"
        ? composeFeedId(args.project_id, args.app, args.feed_id)
        : null,
    project_id: args.project_id || null,

    session_id: String(args.session_id || ""),
    participant_id: args.participant_id || null,
    experiment_group_id: args.experiment_group_id || null,

    prolific_pid: args.prolific_pid || null,
    prolific_session_id: args.prolific_session_id || null,
    prolific_study_id: args.prolific_study_id || null,
    ip_address: args.ip_address || null,

    entered_at: args.entered_at_iso || null,
    submitted_at: args.submitted_at_iso || new Date().toISOString(),
    duration_ms: Number(args.duration_ms || 0) || 0,

    responses: args.responses && typeof args.responses === "object" ? args.responses : {},
  };

  return supabaseInsert("survey_responses", dbRow);
}

// Backs the Feeds table's Total/Submitted/Avg columns
// (components-admin-dashboard.jsx `fetchParticipantsStats`) — computed
// client-side over the raw rows rather than an RPC/aggregate query, same
// tradeoff already made for loadExperimentGroupCounts elsewhere in this
// file: per-feed participant counts are small enough that this is fine, and
// it avoids needing a dedicated Postgres function for one admin-UI stat.
export async function supabaseFetchParticipantsStats({ projectId, app, feedId }) {
  const supabase = getSupabaseClient();
  const composedFeedId = composeFeedId(projectId, app, feedId);
  const { data, error } = await supabase
    .from("participants")
    .select("submitted_at, ms_enter_to_submit")
    .eq("feed_id", composedFeedId);
  if (error) throw new Error(error.message);

  const rows = data || [];
  const submittedRows = rows.filter((r) => r.submitted_at);
  const durations = submittedRows.map((r) => r.ms_enter_to_submit).filter((v) => Number.isFinite(v));

  return {
    total: rows.length,
    submitted: submittedRows.length,
    avg_ms_enter_to_submit: durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null,
  };
}

/* ===================== Participants / CSV export rosters (admin reads) ==== */
export async function supabaseLoadParticipantsRoster({ feedId, projectId, app }) {
  const supabase = getSupabaseClient();
  const composedFeedId = composeFeedId(projectId, app, feedId);
  const { data, error } = await supabase
    .from("participants")
    .select("*")
    .eq("feed_id", composedFeedId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map(mapParticipantRowToRaw);
}

function mapParticipantRowToRaw(row) {
  return {
    session_id: row.session_id ?? "",
    participant_id: row.participant_id ?? "",
    prolific_pid: row.prolific_pid ?? "",
    prolific_session_id: row.prolific_session_id ?? "",
    prolific_study_id: row.prolific_study_id ?? "",
    ip_address: row.ip_address ?? "",
    entered_at_iso: row.entered_at ?? "",
    submitted_at_iso: row.submitted_at ?? "",
    ms_enter_to_submit: row.ms_enter_to_submit ?? "",
    ms_enter_to_last_interaction: row.ms_enter_to_last_interaction ?? "",
    feed_checksum: row.feed_checksum ?? "",
    survey_id: row.survey_id ?? "",
    ...(row.extra && typeof row.extra === "object" ? row.extra : {}),
  };
}

function mapSurveyResponseRowToRaw(row) {
  return {
    session_id: row.session_id ?? "",
    participant_id: row.participant_id ?? "",
    experiment_group_id: row.experiment_group_id ?? "",
    prolific_pid: row.prolific_pid ?? "",
    prolific_session_id: row.prolific_session_id ?? "",
    prolific_study_id: row.prolific_study_id ?? "",
    ip_address: row.ip_address ?? "",
    entered_at_iso: row.entered_at ?? "",
    submitted_at_iso: row.submitted_at ?? "",
    duration_ms: row.duration_ms ?? "",
    survey_id: row.survey_id ?? "",
    project_id: row.project_id ?? "",
    // feed_id is stored composed but every consumer of this roster expects
    // the bare id (it's compared against listFeedsFromBackend's feed_id and
    // shown in CSV columns) — strip the <project>::<app>:: prefix back off.
    feed_id: row.feed_id ? row.feed_id.split("::").slice(2).join("::") : "SURVEY_ONLY",
    responses: row.responses && typeof row.responses === "object" ? row.responses : {},
    response_json: JSON.stringify(row.responses || {}),
  };
}

export async function supabaseLoadSurveyResponsesRoster({ surveyId, feedId, projectId, app }) {
  const supabase = getSupabaseClient();
  let query = supabase.from("survey_responses").select("*").eq("survey_id", surveyId);
  if (feedId) query = query.eq("feed_id", composeFeedId(projectId, app, feedId));
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(mapSurveyResponseRowToRaw);
}

export async function supabaseLoadSurveyResponsesBySurveyRoster({ surveyId }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("survey_responses")
    .select("*")
    .eq("survey_id", surveyId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(mapSurveyResponseRowToRaw);
}

export async function supabaseLoadSurveyParticipantsRoster({ surveyId, projectId, app }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("participants")
    .select("*")
    .eq("survey_id", surveyId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(mapParticipantRowToRaw);
}

export async function supabaseLoadSurveyParticipantsStats({ surveyId }) {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("participants")
    .select("id", { count: "exact", head: true })
    .eq("survey_id", surveyId);
  if (error) throw new Error(error.message);
  return { total: count || 0 };
}

// Deletes both halves of a survey's collected data: the survey_responses
// rows themselves, and every participants row tied to this survey's feed(s)
// — without this, "Delete survey data" only cleared the survey half,
// leaving the matching feed-engagement rows (and therefore their CSV rows)
// behind, exactly what a researcher re-testing a study before real data
// collection doesn't want.
//
// participants.survey_id is NOT reliably stamped in real data — App-*.jsx's
// feed-submit code never actually passes survey_id through to
// buildParticipantRow/sendToSheet (a real, separate bug — see CLAUDE.md),
// so a delete scoped by that column alone silently removed nothing for
// every existing study. The real signal is which feed(s) the participant
// visited: feedIds (the survey's own currently-linked feed ids, from
// orderedLinkedFeedIdsFromSurvey) is used to delete by participants.feed_id
// instead, matching exactly what the "feed + survey" CSV itself displays
// for this survey. The survey_id-scoped delete is kept alongside it as a
// no-cost safety net for any row that *does* have it set (now or in the
// future, once the feed-submit gap above is fixed).
export async function supabaseDeleteSurveyResponses({ surveyId, projectId, app, feedIds = [] }) {
  const supabase = getSupabaseClient();

  const { error: participantsBySurveyErr } = await supabase
    .from("participants")
    .delete()
    .eq("survey_id", surveyId);
  if (participantsBySurveyErr) throw new Error(participantsBySurveyErr.message);

  const composedFeedIds = (Array.isArray(feedIds) ? feedIds : [])
    .map((fid) => String(fid || "").trim())
    .filter(Boolean)
    .map((fid) => composeFeedId(projectId, app, fid));

  if (composedFeedIds.length) {
    const { error: participantsByFeedErr } = await supabase
      .from("participants")
      .delete()
      .in("feed_id", composedFeedIds);
    if (participantsByFeedErr) throw new Error(participantsByFeedErr.message);
  }

  const { error: responsesErr } = await supabase
    .from("survey_responses")
    .delete()
    .eq("survey_id", surveyId);
  if (responsesErr) throw new Error(responsesErr.message);

  return true;
}

/* ======================= Admin user management ======================= */
// Calls the deployed admin-users Edge Function (supabase/functions/admin-users)
// rather than a plain profiles upsert — creating/disabling/deleting a Supabase
// Auth user and resetting another user's password all require the
// service-role key, same reasoning as supabaseSaveSurvey/save-survey above,
// just a higher privilege bar (owner-only, enforced server-side in the
// function itself, not just by the frontend's hasAdminRole("owner") gate).
// functions.invoke attaches the signed-in admin's JWT automatically.
async function invokeAdminUsers(payload) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("admin-users", { body: payload });

  if (error) {
    let msg = error.message || String(error);
    try {
      const body = await error.context?.json?.();
      if (body?.err) msg = body.err;
    } catch {}
    return { ok: false, err: msg };
  }

  if (!data?.ok) return { ok: false, err: data?.err || "request failed" };
  return data;
}

export async function supabaseAdminListUsers() {
  const res = await invokeAdminUsers({ action: "list" });
  if (!res.ok) return res;
  return { ok: true, users: Array.isArray(res.users) ? res.users : [] };
}

export async function supabaseAdminCreateUser(email, password, role = "viewer", username = "") {
  return invokeAdminUsers({ action: "create", email, password, role, username });
}

export async function supabaseAdminUpdateUser({ email, role, password, disabled, username }) {
  const payload = { action: "update", email };
  if (role != null) payload.role = role;
  if (password != null) payload.password = password;
  if (typeof disabled === "boolean") payload.disabled = disabled;
  if (username != null) payload.username = username;
  return invokeAdminUsers(payload);
}

export async function supabaseAdminDeleteUser(email) {
  return invokeAdminUsers({ action: "delete", email });
}

/* =================== Per-user project access (2026-08-04) ===================
 * Backs the reworked Users admin page's project-access editor
 * (see CLAUDE.md). No Edge Function needed — unlike admin-users above,
 * granting/revoking a project doesn't touch Supabase Auth at all, so plain
 * RLS-gated table reads/writes (project_access_write_owner in
 * 20260801000016_project_access.sql) are sufficient, same reasoning as
 * wipeParticipantsOnBackend/custom_measure_groups.
 */

// Every project_access row across every user in one call, so the Users page
// can show each user's granted-project count/list without an N+1 query per
// row. Small table (bounded by users × projects an owner has actually
// restricted), safe to fetch in full and group client-side.
export async function supabaseListProjectAccess() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("project_access")
    .select("user_id, project_id, apps");
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    user_id: row.user_id,
    project_id: row.project_id,
    apps: Array.isArray(row.apps) ? row.apps : [],
  }));
}

// Replaces a user's entire project_access set in one call — delete+reinsert,
// same idiom already used for feed_surveys/experiment_groups resyncs
// elsewhere in this file. Passing an empty array clears every row for that
// user, which per has_project_access()/has_project_app_access() (both in
// the migration above) means "unrestricted — every project, every
// platform," not "no access" — restriction is opt-in via an explicit row,
// never the default.
export async function supabaseSetUserProjectAccess(userId, entries) {
  const supabase = getSupabaseClient();
  const { error: delErr } = await supabase.from("project_access").delete().eq("user_id", userId);
  if (delErr) throw new Error(delErr.message);

  const rows = (Array.isArray(entries) ? entries : [])
    .filter((e) => e && e.project_id)
    .map((e) => ({
      user_id: userId,
      project_id: e.project_id,
      apps: Array.isArray(e.apps) ? e.apps : [],
    }));
  if (!rows.length) return true;

  const { error: insErr } = await supabase.from("project_access").insert(rows);
  if (insErr) throw new Error(insErr.message);
  return true;
}
