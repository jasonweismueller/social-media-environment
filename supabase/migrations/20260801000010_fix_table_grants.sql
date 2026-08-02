-- Fixes a gap discovered during Phase 3's live --apply run: SELECT/INSERT/
-- UPDATE/DELETE were never actually GRANTed to anon/authenticated/
-- service_role on any table in this migration set (confirmed via
-- information_schema.role_table_grants — those three roles only had
-- REFERENCES/TRIGGER/TRUNCATE, not the actual DML privileges).
--
-- Every earlier migration enabled RLS and wrote policies assuming the
-- standard Supabase convention: table-level grants wide open, RLS as the
-- real narrowing layer. That base grant apparently was never present for
-- this project. Its absence surfaces as a hard "permission denied for
-- table" error — a distinct, lower-level Postgres ACL check that happens
-- BEFORE row-level security policies are even evaluated, and it applies
-- even to service_role: BYPASSRLS only skips RLS policy evaluation, not
-- this base grant check.
--
-- Safe to widen: RLS stays enabled on every table from the earlier
-- migrations, so anon/authenticated still can't see or touch anything a
-- policy doesn't explicitly allow. This only unblocks the ACL layer the
-- policies were already written to sit behind.
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;

-- So any table added by a future migration (Phase 4+) gets these grants
-- automatically instead of silently missing them the same way.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
