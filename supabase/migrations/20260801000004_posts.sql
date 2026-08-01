-- Posts. Replaces the `Posts::{project}::{feed}` sheets, which today store
-- one JSON-array blob per feed (the whole feed's post list in one cell).
-- Here each post is its own row, FK'd to its feed, with `sort_order`
-- preserving the array position that blob used to encode implicitly.
--
-- Field list taken directly from makeRandomPost() / the editor components
-- (components-admin-editor-facebook.jsx and siblings) rather than guessed.
-- Facebook has the largest field set (ads, news links, community-note-style
-- interventions); Instagram/Amazon editors only ever populate a subset of
-- these columns, which is fine — unused columns stay null for those posts.
create table public.posts (
  id text primary key,
  feed_id text not null references public.feeds(id) on delete cascade,
  sort_order integer not null default 0,

  post_name text,
  author text,
  post_time text,
  body_text text,
  links jsonb not null default '[]'::jsonb,

  badge boolean not null default false,
  author_type text check (author_type in ('female', 'male', 'company')),
  topic text,

  show_bio boolean not null default false,
  bio_text text,
  bio_url text,
  bio_posts integer,
  bio_followers integer,
  bio_following integer,

  avatar_mode text,
  avatar_random_kind text,
  avatar_url text,

  image_mode text,
  image text,
  video_mode text,
  video text,
  video_poster_url text,
  video_autoplay_muted boolean not null default false,
  video_show_controls boolean not null default true,
  video_loop boolean not null default false,

  intervention_type text not null default 'none' check (intervention_type in ('none', 'label', 'note')),
  note_text text,
  note_meta_enabled boolean not null default false,
  note_reader_groups jsonb not null default '[]'::jsonb,
  note_reader_group2_enabled boolean not null default false,

  show_reactions boolean not null default true,
  selected_reactions jsonb not null default '[]'::jsonb,
  reactions jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,

  ad_type text not null default 'none' check (ad_type in ('none', 'ad', 'news')),
  ad_domain text,
  ad_headline text,
  ad_subheadline text,
  ad_button_text text,
  ad_url text,

  news_domain text,
  news_headline text,
  news_description text,
  news_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index posts_feed_id_idx on public.posts (feed_id, sort_order);

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

alter table public.posts enable row level security;

-- Same reasoning as feeds: participants load posts anonymously.
create policy "posts_select_public"
  on public.posts for select
  to anon, authenticated
  using (true);

create policy "posts_insert_editors"
  on public.posts for insert
  to authenticated
  with check (public.is_admin_writer());

create policy "posts_update_editors"
  on public.posts for update
  to authenticated
  using (public.is_admin_writer())
  with check (public.is_admin_writer());

create policy "posts_delete_editors"
  on public.posts for delete
  to authenticated
  using (public.is_admin_writer());
