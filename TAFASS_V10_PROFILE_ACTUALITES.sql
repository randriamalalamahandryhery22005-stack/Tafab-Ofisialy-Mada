/* =========================================================
   TAFAß V10 — PROFILE / PUBLICATIONS ACTIONS
   Run once after the application update.
   No demo data is inserted.
   ========================================================= */

create table if not exists public.post_shares (
    id uuid primary key default gen_random_uuid(),
    post_id uuid not null references public.posts(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    share_message text default '',
    created_at timestamptz not null default now(),
    unique(post_id,user_id)
);

create table if not exists public.post_reports (
    id uuid primary key default gen_random_uuid(),
    post_id uuid not null references public.posts(id) on delete cascade,
    reporter_id uuid not null references public.profiles(id) on delete cascade,
    reason text not null default 'Contenu à vérifier',
    status text not null default 'pending',
    created_at timestamptz not null default now(),
    unique(post_id,reporter_id)
);

alter table public.post_shares enable row level security;
alter table public.post_reports enable row level security;

-- The publisher or a moderator can manage their own publication through RPC.
-- Comment authors and publication owners can delete comments through RPC.

create or replace function public.tafa_share_post(
    p_post_id uuid,
    p_share_message text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    total_shares integer;
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    if not exists(select 1 from public.posts where id=p_post_id) then raise exception 'Post not found'; end if;

    insert into public.post_shares(post_id,user_id,share_message)
    values(p_post_id,auth.uid(),coalesce(p_share_message,''))
    on conflict(post_id,user_id) do update
      set share_message=excluded.share_message, created_at=now();

    select count(*) into total_shares from public.post_shares where post_id=p_post_id;
    update public.posts set shares=total_shares, updated_at=now() where id=p_post_id;

    return jsonb_build_object('post_id',p_post_id,'shares_count',total_shares);
end;
$$;

grant execute on function public.tafa_share_post(uuid,text) to authenticated;

create or replace function public.tafa_update_post(
    p_post_id uuid,
    p_content text
)
returns public.posts
language plpgsql
security definer
set search_path = public
as $$
declare r public.posts;
begin
    update public.posts
       set content=coalesce(p_content,''), updated_at=now()
     where id=p_post_id and user_id=auth.uid()
     returning * into r;
    if r.id is null then raise exception 'Only the publication owner can modify this post'; end if;
    return r;
end;
$$;

grant execute on function public.tafa_update_post(uuid,text) to authenticated;

create or replace function public.tafa_delete_post(
    p_post_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
    delete from public.posts where id=p_post_id and user_id=auth.uid();
    get diagnostics n = row_count;
    if n=0 then raise exception 'Only the publication owner can delete this post'; end if;
    return true;
end;
$$;

grant execute on function public.tafa_delete_post(uuid) to authenticated;

create or replace function public.tafa_delete_comment(
    p_comment_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
    delete from public.comments c
     where c.id=p_comment_id
       and (
          c.user_id=auth.uid()
          or exists(select 1 from public.posts p where p.id=c.post_id and p.user_id=auth.uid())
       );
    get diagnostics n = row_count;
    if n=0 then raise exception 'You cannot delete this comment'; end if;
    return true;
end;
$$;

grant execute on function public.tafa_delete_comment(uuid) to authenticated;

create or replace function public.tafa_report_post(
    p_post_id uuid,
    p_reason text default 'Contenu à vérifier'
)
returns public.post_reports
language plpgsql
security definer
set search_path = public
as $$
declare r public.post_reports;
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    if exists(select 1 from public.posts where id=p_post_id and user_id=auth.uid()) then
        raise exception 'You cannot report your own publication';
    end if;

    insert into public.post_reports(post_id,reporter_id,reason)
    values(p_post_id,auth.uid(),coalesce(nullif(trim(p_reason),''),'Contenu à vérifier'))
    on conflict(post_id,reporter_id) do update
      set reason=excluded.reason, created_at=now()
    returning * into r;
    return r;
end;
$$;

grant execute on function public.tafa_report_post(uuid,text) to authenticated;

-- RLS for direct reads. Mutations are handled by the secured RPCs above.
drop policy if exists post_shares_select on public.post_shares;
create policy post_shares_select on public.post_shares
for select to authenticated using (true);

drop policy if exists post_reports_select on public.post_reports;
create policy post_reports_select on public.post_reports
for select to authenticated using (reporter_id=auth.uid());

grant select on public.post_shares to authenticated;
grant select on public.post_reports to authenticated;

alter table public.post_shares replica identity full;
alter table public.post_reports replica identity full;

do $$
begin
  begin alter publication supabase_realtime add table public.post_shares; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.post_reports; exception when duplicate_object then null; end;
end $$;

select 'TAFAß V10 PROFILE + PUBLICATION ACTIONS READY' as status;
