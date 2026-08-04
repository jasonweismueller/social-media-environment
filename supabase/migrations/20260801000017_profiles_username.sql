-- Display username for admin accounts (Users page polish, 2026-08-04 — see
-- CLAUDE.md). Purely a display label, not a sign-in credential: Supabase
-- Auth sign-in stays email/password (adminLoginUser in
-- utils-backend-supabase.js), same as before this migration — reworking
-- Auth's identifier away from email is a much larger, riskier change than
-- what was actually asked for (email addresses read as too long in the
-- Users list/detail panel).
--
-- Nullable, not required: the one real account that exists at the time of
-- writing (see 20260801000016's own comment) has no username yet, and this
-- migration doesn't backfill one — the Users page falls back to showing the
-- email wherever username is null, so this is a no-op for every existing
-- account until an owner sets one.
alter table public.profiles add column username text;

-- Case-insensitive uniqueness, same convention as profiles_email_idx
-- (20260801000002_profiles.sql). Partial index (`where username is not
-- null`) so any number of accounts can simultaneously have no username set.
create unique index profiles_username_idx on public.profiles (lower(username)) where username is not null;
