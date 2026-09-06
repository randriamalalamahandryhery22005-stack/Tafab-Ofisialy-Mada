-- ============================================================
-- Tafaß — ADMIN DASHBOARD FINAL ACCESS REPAIR
-- Ce script rend le dashboard indépendant de tafa_is_admin_actor
-- lors de son exécution et recrée les fonctions d'accès.
-- ============================================================

drop function if exists public.tafa_is_admin_actor(uuid);
drop function if exists public.tafa_is_admin(uuid);

-- ============================================================
-- Tafaß — ADMIN ACCESS REPAIR
-- Fix: function public.tafa_is_admin_actor(uuid) does not exist
-- ============================================================

create or replace function public.tafa_is_admin_actor(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and (coalesce(p.is_admin,false) = true or coalesce(p.admin_badge,false) = true)
  );
$$;

create or replace function public.tafa_is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.tafa_is_admin_actor(p_user_id);
$$;

grant execute on function public.tafa_is_admin_actor(uuid) to authenticated;
grant execute on function public.tafa_is_admin(uuid) to authenticated;

-- ============================================================
-- Tafaß — ADMIN DASHBOARD PREMIUM + REALTIME
-- Statistiques, évolution, activité et localisation agrégée
-- ============================================================

create or replace function public.tafa_admin_dashboard_snapshot(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uid uuid := auth.uid();
  days_count integer := greatest(7, least(coalesce(p_days,30), 90));
  total_accounts bigint := 0;
  active_accounts bigint := 0;
  blocked_accounts bigint := 0;
  new_accounts_30d bigint := 0;
  previous_30d_accounts bigint := 0;
  recent_active_accounts bigint := 0;
  total_posts bigint := 0;
  total_stories bigint := 0;
  total_reels bigint := 0;
  total_videos bigint := 0;
  total_groups bigint := 0;
  total_pages bigint := 0;
  total_messages bigint := 0;
  pending_reports bigint := 0;
  pending_verifications bigint := 0;
  pending_appeals bigint := 0;
  pending_withdrawals bigint := 0;
  pending_payments bigint := 0;
  total_coins numeric := 0;
  total_creator_earnings_mga numeric := 0;
  daily jsonb := '[]'::jsonb;
  locations jsonb := '[]'::jsonb;
  r record;
  q text;
begin
  if uid is null then
    raise exception 'Accès réservé à l’administration';
  end if;

  -- Vérification intégrée : le dashboard ne dépend plus d'une fonction auxiliaire.
  if not exists (
    select 1 from public.profiles p
    where p.id = uid
      and (coalesce(p.is_admin,false) = true or coalesce(p.admin_badge,false) = true)
  ) then
    raise exception 'Accès réservé à l’administration';
  end if;

  select count(*) into total_accounts from public.profiles;
  select count(*) into active_accounts from public.profiles where coalesce(account_status,'active') not in ('blocked','restricted','suspended');
  select count(*) into blocked_accounts from public.profiles where coalesce(account_status,'active') in ('blocked','restricted','suspended');
  select count(*) into new_accounts_30d from public.profiles where created_at >= now() - interval '30 days';
  select count(*) into previous_30d_accounts from public.profiles where created_at >= now() - interval '60 days' and created_at < now() - interval '30 days';
  select count(*) into recent_active_accounts from public.profiles where updated_at >= now() - interval '7 days';

  select count(*) into total_posts from public.posts;
  select count(*) into total_stories from public.stories;
  select count(*) into total_reels from public.posts where lower(coalesce(media_type,'')) = 'reel';

  if to_regclass('public.videos') is not null then
    execute 'select count(*) from public.videos' into total_videos;
  else
    select count(*) into total_videos from public.posts where lower(coalesce(media_type,'')) like 'video%';
  end if;

  if to_regclass('public.groups') is not null then
    execute 'select count(*) from public.groups' into total_groups;
  elsif to_regclass('public.tafa_groups') is not null then
    execute 'select count(*) from public.tafa_groups' into total_groups;
  end if;

  if to_regclass('public.pages') is not null then
    execute 'select count(*) from public.pages' into total_pages;
  end if;

  if to_regclass('public.messages') is not null then
    execute 'select count(*) from public.messages' into total_messages;
  elsif to_regclass('public.conversation_messages') is not null then
    execute 'select count(*) from public.conversation_messages' into total_messages;
  end if;

  if to_regclass('public.notifications') is not null then
    select count(*) into pending_reports from public.notifications where lower(coalesce(type,'')) like '%report%' and coalesce(is_read,false)=false;
  end if;

  if to_regclass('public.tafa_verification_requests') is not null then
    execute $q$select count(*) from public.tafa_verification_requests where coalesce(status,'pending')='pending'$q$ into pending_verifications;
  end if;
  if to_regclass('public.tafa_account_appeals') is not null then
    execute $q$select count(*) from public.tafa_account_appeals where coalesce(status,'pending')='pending'$q$ into pending_appeals;
  end if;
  if to_regclass('public.tafa_withdrawals') is not null then
    execute $q$select count(*) from public.tafa_withdrawals where coalesce(status,'pending')='pending'$q$ into pending_withdrawals;
  end if;
  if to_regclass('public.tafa_payments') is not null then
    execute $q$select count(*) from public.tafa_payments where coalesce(status,'pending')='pending'$q$ into pending_payments;
  end if;

  if to_regclass('public.tafa_wallets') is not null then
    execute $q$select coalesce(sum(coins),0) from public.tafa_wallets$q$ into total_coins;
  elsif to_regclass('public.wallets') is not null then
    execute $q$select coalesce(sum(coins),0) from public.wallets$q$ into total_coins;
  end if;

  if to_regclass('public.tafa_creator_earnings') is not null then
    execute $q$select coalesce(sum(amount_mga),0) from public.tafa_creator_earnings$q$ into total_creator_earnings_mga;
  elsif to_regclass('public.creator_earnings') is not null then
    execute $q$select coalesce(sum(amount_mga),0) from public.creator_earnings$q$ into total_creator_earnings_mga;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'day',d::date,
    'day_label',to_char(d,'DD/MM'),
    'new_accounts',(select count(*) from public.profiles p where p.created_at::date=d::date)
  ) order by d),'[]'::jsonb)
  into daily
  from generate_series(current_date-(days_count-1),current_date,interval '1 day') d;

  select coalesce(jsonb_agg(jsonb_build_object('city',x.city,'country',x.country,'accounts',x.accounts) order by x.accounts desc),'[]'::jsonb)
  into locations
  from (
    select coalesce(nullif(trim(p.city_current),''),'Localisation inconnue') as city,
           coalesce(nullif(trim(p.country),''),'Pays inconnu') as country,
           count(*)::bigint as accounts
    from public.profiles p
    group by 1,2
    order by count(*) desc
    limit 20
  ) x;

  return jsonb_build_object(
    'overview',jsonb_build_object(
      'total_accounts',total_accounts,
      'active_accounts',active_accounts,
      'blocked_accounts',blocked_accounts,
      'new_accounts_30d',new_accounts_30d,
      'previous_30d_accounts',previous_30d_accounts,
      'recent_active_accounts',recent_active_accounts,
      'total_posts',total_posts,
      'total_stories',total_stories,
      'total_reels',total_reels,
      'total_videos',total_videos,
      'total_groups',total_groups,
      'total_pages',total_pages,
      'total_messages',total_messages,
      'pending_reports',pending_reports,
      'pending_verifications',pending_verifications,
      'pending_appeals',pending_appeals,
      'pending_withdrawals',pending_withdrawals,
      'pending_payments',pending_payments,
      'pending_total',pending_reports+pending_verifications+pending_appeals+pending_withdrawals+pending_payments,
      'total_coins',total_coins,
      'total_creator_earnings_mga',total_creator_earnings_mga
    ),
    'daily',daily,
    'locations',locations,
    'generated_at',now()
  );
end;
$fn$;

grant execute on function public.tafa_admin_dashboard_snapshot(integer) to authenticated;

-- Realtime doit être activé sur les tables principales si elles ne le sont pas déjà.
-- Ces commandes sont idempotentes pour les publications Supabase.
do $$
begin
  begin alter publication supabase_realtime add table public.profiles; exception when duplicate_object then null; when undefined_object then null; end;
  begin alter publication supabase_realtime add table public.posts; exception when duplicate_object then null; when undefined_object then null; end;
  begin alter publication supabase_realtime add table public.stories; exception when duplicate_object then null; when undefined_object then null; end;
end $$;
