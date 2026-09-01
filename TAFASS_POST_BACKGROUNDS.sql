-- TAFAß: publication backgrounds (safe migration)
alter table if exists public.posts
  add column if not exists background_style text default 'plain';

update public.posts
set background_style='plain'
where background_style is null;

create index if not exists posts_background_style_idx on public.posts(background_style);
