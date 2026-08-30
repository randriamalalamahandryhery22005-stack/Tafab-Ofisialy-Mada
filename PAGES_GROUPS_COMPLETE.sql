-- TAFAß Pages & Groups COMPLETE upgrade
-- Safe to run after TAFASS_FINAL_COMPLETE_REALTIME.sql
create table if not exists public.page_posts (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text default '', media_url text, media_type text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.group_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text default '', media_url text, media_type text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.page_posts enable row level security;
alter table public.group_posts enable row level security;
drop policy if exists page_posts_select on public.page_posts;
drop policy if exists page_posts_insert on public.page_posts;
drop policy if exists page_posts_update on public.page_posts;
drop policy if exists page_posts_delete on public.page_posts;
create policy page_posts_select on public.page_posts for select to authenticated using(true);
create policy page_posts_insert on public.page_posts for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.pages p where p.id=page_id and p.owner_id=auth.uid()));
create policy page_posts_update on public.page_posts for update to authenticated using(user_id=auth.uid());
create policy page_posts_delete on public.page_posts for delete to authenticated using(user_id=auth.uid());
drop policy if exists group_posts_select on public.group_posts;
drop policy if exists group_posts_insert on public.group_posts;
drop policy if exists group_posts_update on public.group_posts;
drop policy if exists group_posts_delete on public.group_posts;
create policy group_posts_select on public.group_posts for select to authenticated using(true);
create policy group_posts_insert on public.group_posts for insert to authenticated with check(user_id=auth.uid() and public.tafa_is_group_member(group_id,auth.uid()));
create policy group_posts_update on public.group_posts for update to authenticated using(user_id=auth.uid());
create policy group_posts_delete on public.group_posts for delete to authenticated using(user_id=auth.uid());
create index if not exists page_posts_page_created_idx on public.page_posts(page_id,created_at desc);
create index if not exists group_posts_group_created_idx on public.group_posts(group_id,created_at desc);
alter table public.page_posts replica identity full;
alter table public.group_posts replica identity full;
do $$ begin
  begin alter publication supabase_realtime add table public.page_posts; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.group_posts; exception when duplicate_object then null; end;
end $$;
create or replace function public.tafa_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists tafa_page_posts_updated_at on public.page_posts;
create trigger tafa_page_posts_updated_at before update on public.page_posts for each row execute function public.tafa_set_updated_at();
drop trigger if exists tafa_group_posts_updated_at on public.group_posts;
create trigger tafa_group_posts_updated_at before update on public.group_posts for each row execute function public.tafa_set_updated_at();
notify pgrst,'reload schema';
