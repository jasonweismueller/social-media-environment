-- Lets a signed-in user set/change their OWN display username directly
-- (no owner privileges needed) — used by AdminSetPassword.jsx right after
-- accepting an invite, so a brand-new admin isn't stuck with whatever
-- username the inviting owner guessed (or left blank) at invite time, with
-- no way to know or change it themselves.
--
-- Every other profile field (role, disabled, email) must stay owner-only.
-- RLS alone can't express that distinction — a `for update using (auth.uid()
-- = id)` policy would let a user rewrite ANY column on their own row,
-- including role/disabled, which would silently reopen the exact
-- self-escalation risk the SOLE_OWNER_EMAIL hardening in admin-users/
-- index.ts already exists to prevent (see that file's own comment about the
-- 2026-08-04 self-lockout incident). So the real enforcement here is a
-- column-scoped GRANT, not the RLS policy — Postgres checks both, and a
-- column absent from the grant is rejected regardless of what RLS allows.
--
-- Safe to narrow the `authenticated` role's UPDATE grant this way: grepped
-- the whole codebase first and confirmed every other write to `profiles`
-- (role changes, disabling accounts, password resets) goes through the
-- admin-users Edge Function's service_role client, which bypasses RLS and
-- GRANTs entirely — nothing relies on `authenticated` having broader
-- UPDATE access on this table today.
create policy "profiles_update_self_username"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke update on public.profiles from authenticated;
grant update (username) on public.profiles to authenticated;
