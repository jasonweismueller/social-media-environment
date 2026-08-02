// Phase 4 Edge Function: admin user management (adminListUsers/adminCreateUser/
// adminUpdateUser/adminDeleteUser in src/utils/utils-backend.js — see CLAUDE.md
// "Backend migration" > "What's still on GAS only (not ported)").
//
// Needs a real function rather than a plain PostgREST call because creating/
// disabling/deleting a Supabase Auth user (and resetting another user's
// password) requires the service-role key, which must never reach the
// frontend — same reasoning as save-survey/index.ts, different privilege
// level. Every action here is gated to the caller's own profiles.role being
// 'owner', matching both the RLS policies on public.profiles
// (20260801000002_profiles.sql) and the frontend gate
// (hasAdminRole("owner") in components-admin-users.jsx) that only owners
// ever see this UI at all — this function is the real enforcement, the
// frontend gate is just UX.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handlePreflight, jsonResponse } from "../_shared/cors.ts";

const ROLES = ["viewer", "editor", "owner"];

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

  const { data: callerData, error: callerErr } = await admin.auth.getUser(jwt);
  if (callerErr || !callerData?.user) {
    return jsonResponse({ ok: false, err: "invalid or expired session" }, { status: 401 });
  }

  const { data: callerProfile, error: callerProfileErr } = await admin
    .from("profiles")
    .select("role, disabled")
    .eq("id", callerData.user.id)
    .maybeSingle();

  if (callerProfileErr) {
    return jsonResponse({ ok: false, err: callerProfileErr.message }, { status: 500 });
  }
  if (!callerProfile || callerProfile.disabled || callerProfile.role !== "owner") {
    return jsonResponse({ ok: false, err: "owner role required" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, err: "invalid JSON body" }, { status: 400 });
  }

  const action = String(body?.action || "");

  if (action === "list") {
    const { data, error } = await admin
      .from("profiles")
      .select("id, email, role, disabled, created_at")
      .order("email", { ascending: true });
    if (error) return jsonResponse({ ok: false, err: error.message }, { status: 500 });
    return jsonResponse({ ok: true, users: data || [] }, { headers: corsHeaders });
  }

  if (action === "create") {
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const role = ROLES.includes(body?.role) ? body.role : "viewer";
    if (!email || !password) {
      return jsonResponse({ ok: false, err: "email and password are required" }, { status: 400 });
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      return jsonResponse({ ok: false, err: createErr?.message || "failed to create user" }, { status: 500 });
    }

    // handle_new_auth_user (20260801000002_profiles.sql) already inserted a
    // profiles row with the default role 'viewer' via trigger — only need a
    // second write when a non-default role was requested.
    if (role !== "viewer") {
      const { error: roleErr } = await admin.from("profiles").update({ role }).eq("id", created.user.id);
      if (roleErr) return jsonResponse({ ok: false, err: roleErr.message }, { status: 500 });
    }

    return jsonResponse({ ok: true }, { headers: corsHeaders });
  }

  if (action === "update") {
    const email = String(body?.email || "").trim().toLowerCase();
    if (!email) return jsonResponse({ ok: false, err: "email is required" }, { status: 400 });

    const { data: target, error: targetErr } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (targetErr) return jsonResponse({ ok: false, err: targetErr.message }, { status: 500 });
    if (!target) return jsonResponse({ ok: false, err: "user not found" }, { status: 404 });

    if (body?.password) {
      const { error: pwErr } = await admin.auth.admin.updateUserById(target.id, {
        password: String(body.password),
      });
      if (pwErr) return jsonResponse({ ok: false, err: pwErr.message }, { status: 500 });
    }

    const profileUpdates: Record<string, unknown> = {};
    if (body?.role != null && ROLES.includes(body.role)) profileUpdates.role = body.role;
    if (typeof body?.disabled === "boolean") profileUpdates.disabled = body.disabled;

    if (Object.keys(profileUpdates).length) {
      const { error: updateErr } = await admin.from("profiles").update(profileUpdates).eq("id", target.id);
      if (updateErr) return jsonResponse({ ok: false, err: updateErr.message }, { status: 500 });
    }

    return jsonResponse({ ok: true }, { headers: corsHeaders });
  }

  if (action === "delete") {
    const email = String(body?.email || "").trim().toLowerCase();
    if (!email) return jsonResponse({ ok: false, err: "email is required" }, { status: 400 });

    // Not a data-integrity concern (profiles.id cascades from auth.users
    // fine either way) — this only exists so an owner can't lock themselves
    // out of user management with no other owner able to undo it.
    if (email === (callerData.user.email || "").toLowerCase()) {
      return jsonResponse({ ok: false, err: "cannot delete your own account" }, { status: 400 });
    }

    const { data: target, error: targetErr } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (targetErr) return jsonResponse({ ok: false, err: targetErr.message }, { status: 500 });
    if (!target) return jsonResponse({ ok: false, err: "user not found" }, { status: 404 });

    // profiles.id references auth.users(id) on delete cascade, so this also
    // removes the profiles row — no second delete needed.
    const { error: deleteErr } = await admin.auth.admin.deleteUser(target.id);
    if (deleteErr) return jsonResponse({ ok: false, err: deleteErr.message }, { status: 500 });

    return jsonResponse({ ok: true }, { headers: corsHeaders });
  }

  return jsonResponse({ ok: false, err: `unknown action: ${action}` }, { status: 400 });
});
