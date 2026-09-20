-- Adds a per-post crop/zoom framing for the post's OWN (uploaded/URL) avatar,
-- stored as {"focalX": 0-100, "focalY": 0-100, "zoom": 1-4} — the same shape the
-- Instagram post-image cropper already uses (getImageCropStyle). NULL = the
-- default centred "cover" crop, so every existing post renders exactly as before.
--
-- Lets an admin frame a wide logo (which a circular avatar otherwise centre-crops
-- into an illegible sliver) on the part that actually reads at ~34px.
alter table public.posts
  add column if not exists avatar_crop jsonb;
