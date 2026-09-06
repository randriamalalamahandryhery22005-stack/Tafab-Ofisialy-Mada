/* TAFAß ADMIN TOTAL V28.3.2 — secure RPCs */
alter table public.profiles add column if not exists account_status text not null default 'active';
create index if not exists profiles_account_status_idx on public.profiles(account_status);

create or replace function public.tafa_admin_total_stats()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r jsonb;
begin
 if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
 select jsonb_build_object(
 'total_accounts',(select count(*) from public.profiles),
 'active_accounts',(select count(*) from public.profiles where coalesce(account_status,'active')='active'),
 'blocked_accounts',(select count(*) from public.profiles where account_status='blocked'),
 'total_posts',(select count(*) from public.posts),
 'total_comments',(select count(*) from public.comments),
 'total_notifications',(select count(*) from public.notifications)
 ) into r; return r;
end $$;

grant execute on function public.tafa_admin_total_stats() to authenticated;

create or replace function public.tafa_admin_list_users(p_limit integer default 80,p_offset integer default 0)
returns table(id uuid,first_name text,last_name text,username text,email text,avatar_url text,account_status text,created_at timestamptz)
language sql stable security definer set search_path=public as $$
 select p.id,p.first_name,p.last_name,p.username,p.email,p.avatar_url,coalesce(p.account_status,'active'),p.created_at
 from public.profiles p
 where public.tafa_is_admin(auth.uid())
 order by p.created_at desc nulls last
 limit greatest(1,least(p_limit,200)) offset greatest(0,p_offset);
$$;
grant execute on function public.tafa_admin_list_users(integer,integer) to authenticated;

create or replace function public.tafa_admin_set_account_status(p_user_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
 if p_status not in ('active','blocked') then raise exception 'Statut invalide'; end if;
 if p_user_id=auth.uid() then raise exception 'Vous ne pouvez pas bloquer votre propre compte'; end if;
 update public.profiles set account_status=p_status,updated_at=now() where id=p_user_id;
 return found;
end $$;
grant execute on function public.tafa_admin_set_account_status(uuid,text) to authenticated;

notify pgrst, 'reload schema';
