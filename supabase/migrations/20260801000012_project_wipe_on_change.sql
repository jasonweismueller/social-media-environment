-- Project-level "wipe participants when a feed's checksum changes on
-- publish" policy (CLAUDE.md: the "Wipe on change" toggle in the Feeds page
-- toolbar, `getWipePolicyFromBackend`/`setWipePolicyOnBackend`). GAS's
-- equivalent (`set_wipe_policy`/`wipe_policy` actions) is a single global
-- flag with no project scoping at all. Deliberately diverges from that
-- shape here — project-scoped instead of global, default off — per direct
-- user request when deciding how to port this for Supabase: publishing
-- changed posts should not silently destroy existing participant data
-- unless a project has explicitly opted in.
alter table public.projects
  add column wipe_on_change boolean not null default false;
