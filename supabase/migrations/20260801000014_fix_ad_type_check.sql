-- Fixes a real check-constraint gap found 2026-08-02 while repairing missing
-- posts after the production cutover (CLAUDE.md "Backend migration").
--
-- posts.ad_type's check constraint only allowed ('none', 'ad', 'news') —
-- the Phase 1 schema comment says the field list was "taken directly from
-- makeRandomPost() / the editor components... Facebook has the largest
-- field set", but Instagram's post editor
-- (components-admin-editor-instagram.jsx) has a fourth option this missed:
-- adType "influencer" ("Influencer Partnership"), a real, actively-rendered
-- post type (ui-posts-instagram.jsx checks `post.adType === "influencer"`
-- for its own sponsored-post treatment, distinct from "ad"). A real
-- Instagram post using it rejected on insert during the posts repair.

alter table public.posts drop constraint posts_ad_type_check;
alter table public.posts add constraint posts_ad_type_check
  check (ad_type in ('none', 'ad', 'news', 'influencer'));
