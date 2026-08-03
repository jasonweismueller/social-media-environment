// Phase 2 Edge Function: survey-definition sanitization + save.
//
// Ports Code.gs's sanitizeSurveyDef_ / handleSaveSurvey_ (survey_create /
// survey_update actions) — see ~/.claude/plans/gradual-migrating-codd.md
// Phase 2 and CLAUDE.md "Backend migration planning". Not wired to the
// frontend yet (that's Phase 4, behind the VITE_BACKEND flag) — this file
// is reachable only by directly invoking the deployed function.
//
// Unlike every read/write covered by plain PostgREST + RLS elsewhere in
// this migration, survey saves need a real function because: (1) the
// definition needs server-side normalization before it's trusted (an admin
// browser is not a trusted client for shape validation — same reasoning
// Code.gs's sanitizeSurveyDef_ already applies), and (2) saving a survey is
// two writes that need to stay in sync (the `surveys` row and the
// `feed_surveys` link rows derived from feed_sequence_ids) — exactly what
// handleSaveSurvey_ does server-side today.
//
// Auth model: this function receives the *user's* Supabase Auth JWT (not
// the admin_token scheme utils-backend.js uses against Code.gs today), and
// uses the service-role key internally to look up that user's `profiles`
// role and to perform the writes — RLS on `surveys`/`feed_surveys` would
// otherwise also allow this via a plain authenticated upsert, but a real
// function is still needed for the sanitization + two-table-sync step, so
// the writes run against the same connection rather than a second
// round-trip through PostgREST.

// Pinned to an exact version (not the floating @2) because esm.sh's
// currently-resolved latest 2.x (2.112.0) has a broken denonext build for
// one of its own sub-dependencies (@supabase/auth-js) as of this deploy —
// confirmed via direct curl, unrelated to anything in this function. Safe
// to bump back to a floating range once that's fixed upstream.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import { corsHeaders, handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { frontendSurveyToBackend, normalizeSurvey } from "../_shared/survey-sanitize.ts";

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, err: "method not allowed" }, { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) {
    return jsonResponse({ ok: false, err: "missing Authorization bearer token" }, { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Verify the caller's identity from their own JWT, then look up their
  // role via the service-role client (bypasses RLS — we ARE the privilege
  // check here, not relying on a policy to enforce it).
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return jsonResponse({ ok: false, err: "invalid or expired session" }, { status: 401 });
  }

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("role, disabled")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileErr) {
    return jsonResponse({ ok: false, err: profileErr.message }, { status: 500 });
  }

  if (!profile || profile.disabled || !["editor", "owner"].includes(profile.role)) {
    return jsonResponse({ ok: false, err: "insufficient privilege" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, err: "invalid JSON body" }, { status: 400 });
  }

  const rawDefinition = body?.definition;
  if (!rawDefinition || typeof rawDefinition !== "object") {
    return jsonResponse({ ok: false, err: "missing definition" }, { status: 400 });
  }

  // Normalize once for a stable survey_id/name/etc (normalizeSurvey mints a
  // random fallback id when one is missing — calling it twice on the same
  // raw input could otherwise mint two different ids), then feed the
  // already-normalized result into frontendSurveyToBackend for the full
  // sanitized definition blob that gets stored as JSONB.
  const normalized = normalizeSurvey(rawDefinition);
  const definition = frontendSurveyToBackend(normalized);

  const projectId = String(body?.project_id || normalized.linked_project_id || "").trim() || null;
  const app = String(body?.app || "fb").trim();

  // experiment_groups moved to its own table (migration
  // 20260801000015_experiment_groups_and_custom_measure_groups_tables.sql) —
  // it's the sole source of truth now (assign_experiment_group reads it
  // directly), so it's dropped from the stored jsonb rather than kept as a
  // second, driftable copy. supabaseLoadSurveyDefinition merges it back onto
  // the returned object from the table on every read, so nothing downstream
  // of a load ever sees the gap.
  const experimentGroups: Array<{ id: string; name: string; feed_sequence_ids: string[] }> = Array.isArray(
    definition.experiment_groups
  )
    ? definition.experiment_groups
    : [];
  const { experiment_groups: _droppedExperimentGroups, ...storedDefinition } = definition;

  const { data: savedSurvey, error: saveErr } = await admin
    .from("surveys")
    .upsert(
      {
        id: normalized.survey_id,
        project_id: projectId,
        name: normalized.name,
        status: normalized.status,
        version: normalized.version,
        completion_mode: normalized.completion_mode,
        completion_redirect_url: normalized.completion_redirect_url,
        definition: storedDefinition,
      },
      { onConflict: "id" }
    )
    .select()
    .single();

  if (saveErr) {
    return jsonResponse({ ok: false, err: saveErr.message }, { status: 500 });
  }

  // Sync experiment_groups the same way feed_surveys is synced just below
  // (delete + reinsert — this function isn't called concurrently for the
  // same survey in practice).
  const { error: ungroupErr } = await admin.from("experiment_groups").delete().eq("survey_id", normalized.survey_id);
  if (ungroupErr) {
    return jsonResponse({ ok: false, err: ungroupErr.message }, { status: 500 });
  }

  if (experimentGroups.length) {
    const { error: groupErr } = await admin.from("experiment_groups").insert(
      experimentGroups.map((group, index) => ({
        survey_id: normalized.survey_id,
        id: group.id,
        name: group.name,
        feed_sequence_ids: Array.isArray(group.feed_sequence_ids) ? group.feed_sequence_ids : [],
        sort_order: index,
      }))
    );
    if (groupErr) {
      return jsonResponse({ ok: false, err: groupErr.message }, { status: 500 });
    }
  }

  // Re-derive feed_surveys links from feed_sequence_ids, matching
  // handleSaveSurvey_'s "link every feed in feed_sequence_ids" behavior
  // (CLAUDE.md, "Survey/posts loading performance fixes" #1). Delete +
  // reinsert rather than diffing — this function isn't called concurrently
  // for the same survey in practice, and simplicity matters more than a
  // marginal write count here.
  //
  // feed_sequence_ids holds bare feed_ids (e.g. "feed_1"), but feeds.id —
  // and therefore feed_surveys.feed_id's FK target — is the synthetic
  // "<project_id>::<app>::<feed_id>" key added in migration
  // 20260801000011_fix_feed_id_collisions.sql (real feed_ids repeat across
  // projects/apps, so the bare id isn't unique). That migration landed
  // after this function was first written, and the composition was never
  // applied here — every save that linked feeds would have FK-violated on
  // the insert below. Only compose when we actually have a projectId; a
  // survey with no project has no real feeds to link to.
  const rawFeedIds: string[] = Array.isArray(definition.feed_sequence_ids)
    ? definition.feed_sequence_ids.filter((id: unknown) => typeof id === "string" && id)
    : [];
  const feedIds: string[] = projectId ? rawFeedIds.map((fid) => `${projectId}::${app}::${fid}`) : [];

  const { error: unlinkErr } = await admin.from("feed_surveys").delete().eq("survey_id", normalized.survey_id);
  if (unlinkErr) {
    return jsonResponse({ ok: false, err: unlinkErr.message }, { status: 500 });
  }

  if (feedIds.length) {
    const { error: linkErr } = await admin
      .from("feed_surveys")
      .insert(feedIds.map((feed_id) => ({ feed_id, survey_id: normalized.survey_id })));
    if (linkErr) {
      return jsonResponse({ ok: false, err: linkErr.message }, { status: 500 });
    }
  }

  return jsonResponse(
    { ok: true, survey_id: normalized.survey_id, definition, survey: savedSurvey },
    { headers: corsHeaders }
  );
});
