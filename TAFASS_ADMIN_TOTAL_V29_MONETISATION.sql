/* =========================================================
   TAFAß ADMIN TOTAL V29 — MONETISATION + RED BADGE + MODERATION
   Safe additive migration. No user/content data is deleted.
   Execute once in Supabase SQL Editor as postgres.
   ========================================================= */

alter table public.profiles add column if not exists account_status text not null default 'active';
create index if not exists profiles_account_status_idx on public.profiles(account_status);

create or replace function public.tafa_admin_total_stats()
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare r jsonb;
begin
  if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
  select jsonb_build_object(
    'total_accounts',(select count(*) from public.profiles),
    'active_accounts',(select count(*) from public.profiles where coalesce(account_status,'active')='active'),
    'blocked_accounts',(select count(*) from public.profiles where account_status='blocked'),
    'total_posts',(select count(*) from public.posts),
    'total_comments',(select count(*) from public.comments),
    'total_notifications',(select count(*) from public.notifications),
    'total_coins',(select coalesce(sum(coins),0) from public.tafab_wallets),
    'total_creator_earnings_mga',(select coalesce(sum(earnings_mga),0) from public.tafab_wallets),
    'pending_withdrawals',(select count(*) from public.tafab_withdrawal_requests where status='pending'),
    'pending_payments',(select count(*) from public.payment_transactions where status='pending'),
    'pending_reports',(select count(*) from public.profile_reports where status='pending'),
    'pending_total',
      (select count(*) from public.tafab_withdrawal_requests where status='pending')
      +(select count(*) from public.payment_transactions where status='pending')
      +(select count(*) from public.profile_reports where status='pending')
  ) into r;
  return r;
end $$;
grant execute on function public.tafa_admin_total_stats() to authenticated;

create or replace function public.tafa_admin_badge_count()
returns bigint language sql stable security definer set search_path=public as $$
  select case when public.tafa_is_admin(auth.uid()) then
    (select count(*) from public.tafab_withdrawal_requests where status='pending')
    +(select count(*) from public.payment_transactions where status='pending')
    +(select count(*) from public.profile_reports where status='pending')
  else 0 end;
$$;
grant execute on function public.tafa_admin_badge_count() to authenticated;

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

create or replace function public.tafa_admin_list_withdrawals(p_limit integer default 50)
returns table(id uuid,user_id uuid,display_name text,amount_mga bigint,method text,status text,created_at timestamptz)
language sql stable security definer set search_path=public as $$
 select w.id,w.user_id,
   coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.username,p.email,'Compte'),
   w.amount_mga,w.method,w.status,w.created_at
 from public.tafab_withdrawal_requests w
 left join public.profiles p on p.id=w.user_id
 where public.tafa_is_admin(auth.uid())
 order by w.created_at desc limit greatest(1,least(p_limit,200));
$$;
grant execute on function public.tafa_admin_list_withdrawals(integer) to authenticated;

create or replace function public.tafa_admin_set_withdrawal_status(p_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_amount bigint;
begin
 if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
 if p_status not in ('approved','rejected','paid') then raise exception 'Statut de retrait invalide'; end if;
 select user_id,amount_mga into v_user,v_amount from public.tafab_withdrawal_requests where id=p_id for update;
 if v_user is null then raise exception 'Retrait introuvable'; end if;
 if p_status='paid' then
   update public.tafab_wallets set earnings_mga=earnings_mga-v_amount,updated_at=now()
   where user_id=v_user and earnings_mga>=v_amount;
   if not found then raise exception 'Revenus créateur insuffisants'; end if;
 end if;
 update public.tafab_withdrawal_requests set status=p_status,processed_at=now() where id=p_id;
 return true;
end $$;
grant execute on function public.tafa_admin_set_withdrawal_status(uuid,text) to authenticated;

create or replace function public.tafa_admin_list_payments(p_limit integer default 50)
returns table(id uuid,user_id uuid,display_name text,method text,amount numeric,currency text,status text,external_reference text,created_at timestamptz)
language sql stable security definer set search_path=public as $$
 select t.id,t.user_id,
   coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.username,p.email,'Compte'),
   t.method,t.amount,t.currency,t.status,t.external_reference,t.created_at
 from public.payment_transactions t
 left join public.profiles p on p.id=t.user_id
 where public.tafa_is_admin(auth.uid())
 order by t.created_at desc limit greatest(1,least(p_limit,200));
$$;
grant execute on function public.tafa_admin_list_payments(integer) to authenticated;

create or replace function public.tafa_admin_set_payment_status(p_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
 if p_status not in ('paid','failed','cancelled') then raise exception 'Statut de paiement invalide'; end if;
 update public.payment_transactions set status=p_status,updated_at=now() where id=p_id;
 return found;
end $$;
grant execute on function public.tafa_admin_set_payment_status(uuid,text) to authenticated;

create or replace function public.tafa_admin_list_reports(p_limit integer default 50)
returns table(id uuid,reporter_name text,reported_name text,reason text,status text,created_at timestamptz)
language sql stable security definer set search_path=public as $$
 select r.id,
   coalesce(nullif(trim(concat_ws(' ',rp.first_name,rp.last_name)),''),rp.username,rp.email,'Compte'),
   coalesce(nullif(trim(concat_ws(' ',tp.first_name,tp.last_name)),''),tp.username,tp.email,'Compte'),
   r.reason,r.status,r.created_at
 from public.profile_reports r
 left join public.profiles rp on rp.id=r.reporter_id
 left join public.profiles tp on tp.id=r.reported_id
 where public.tafa_is_admin(auth.uid())
 order by r.created_at desc limit greatest(1,least(p_limit,200));
$$;
grant execute on function public.tafa_admin_list_reports(integer) to authenticated;

create or replace function public.tafa_admin_set_report_status(p_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
 if p_status not in ('resolved','rejected','pending') then raise exception 'Statut de signalement invalide'; end if;
 update public.profile_reports set status=p_status,updated_at=now() where id=p_id;
 return found;
end $$;
grant execute on function public.tafa_admin_set_report_status(uuid,text) to authenticated;

notify pgrst,'reload schema';

select 'TAFAß ADMIN TOTAL V29 READY' as status;
