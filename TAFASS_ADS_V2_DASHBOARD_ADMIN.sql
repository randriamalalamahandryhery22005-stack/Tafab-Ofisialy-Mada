/* =========================================================
   TAFAß ADS V2 — TABLEAU DE BORD PROPRIÉTAIRE + ADMIN TOTAL
   Migration additive : aucune donnée publicitaire existante n'est supprimée.
   ========================================================= */

create index if not exists tafab_ad_events_campaign_created_idx
  on public.tafab_ad_events(campaign_id, created_at desc);
create index if not exists tafab_ad_events_campaign_user_type_idx
  on public.tafab_ad_events(campaign_id, user_id, event_type, created_at desc);

create or replace function public.tafab_ad_campaign_dashboard(p_campaign_id uuid)
returns table(
  impressions bigint,
  unique_reach bigint,
  clicks bigint,
  unique_clickers bigint,
  ctr numeric,
  engagement_events bigint,
  last_event_at timestamptz
)
language sql stable security definer set search_path=public as $$
  select
    count(*) filter (where e.event_type='impression'),
    count(distinct e.user_id) filter (where e.event_type='impression'),
    count(*) filter (where e.event_type='click'),
    count(distinct e.user_id) filter (where e.event_type='click'),
    case when count(*) filter (where e.event_type='impression') > 0
      then round((100.0 * count(*) filter (where e.event_type='click')) / (count(*) filter (where e.event_type='impression')),2)
      else 0 end,
    count(*) filter (where e.event_type not in ('impression','click')),
    max(e.created_at)
  from public.tafab_ad_events e
  join public.tafab_ad_campaigns c on c.id=e.campaign_id
  where e.campaign_id=p_campaign_id
    and (c.owner_id=auth.uid() or public.tafa_is_admin(auth.uid()));
$$;
revoke all on function public.tafab_ad_campaign_dashboard(uuid) from public;
grant execute on function public.tafab_ad_campaign_dashboard(uuid) to authenticated;

create or replace function public.tafab_ad_campaign_daily_stats(p_campaign_id uuid,p_days integer default 14)
returns table(day date, impressions bigint, clicks bigint, unique_reach bigint)
language sql stable security definer set search_path=public as $$
  select
    d.day::date,
    count(e.*) filter (where e.event_type='impression'),
    count(e.*) filter (where e.event_type='click'),
    count(distinct e.user_id) filter (where e.event_type='impression')
  from generate_series(current_date-(greatest(1,least(p_days,90))-1),current_date,interval '1 day') d(day)
  left join public.tafab_ad_events e
    on e.campaign_id=p_campaign_id and e.created_at >= d.day and e.created_at < d.day + interval '1 day'
  where exists(
    select 1 from public.tafab_ad_campaigns c
    where c.id=p_campaign_id and (c.owner_id=auth.uid() or public.tafa_is_admin(auth.uid()))
  )
  group by d.day
  order by d.day;
$$;
revoke all on function public.tafab_ad_campaign_daily_stats(uuid,integer) from public;
grant execute on function public.tafab_ad_campaign_daily_stats(uuid,integer) to authenticated;

create or replace function public.tafab_owner_pause_boost_campaign(p_campaign_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.tafab_ad_campaigns where id=p_campaign_id for update;
  if v_owner is null or v_owner<>auth.uid() then raise exception 'Accès à la campagne refusé'; end if;
  update public.tafab_ad_campaigns
     set status='paused', updated_at=now()
   where id=p_campaign_id and owner_id=auth.uid() and status='active';
  return found;
end $$;
revoke all on function public.tafab_owner_pause_boost_campaign(uuid) from public;
grant execute on function public.tafab_owner_pause_boost_campaign(uuid) to authenticated;

create or replace function public.tafa_admin_list_boost_campaigns(p_limit integer default 200)
returns table(
  id uuid,
  owner_id uuid,
  page_id uuid,
  post_id uuid,
  name text,
  ad_type text,
  objective text,
  status text,
  payment_status text,
  amount_paid_mga bigint,
  spent_amount_mga bigint,
  total_budget_mga bigint,
  daily_budget_mga bigint,
  audience_location text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz,
  owner_name text
)
language sql stable security definer set search_path=public as $$
  select c.id,c.owner_id,c.page_id,c.post_id,c.name,c.ad_type,c.objective,c.status,c.payment_status,
    c.amount_paid_mga,c.spent_amount_mga,c.total_budget_mga,c.daily_budget_mga,c.audience_location,
    c.starts_at,c.ends_at,c.created_at,
    coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.username,p.email,'Compte')
  from public.tafab_ad_campaigns c
  left join public.profiles p on p.id=c.owner_id
  where public.tafa_is_admin(auth.uid())
  order by c.created_at desc
  limit greatest(1,least(p_limit,500));
$$;
revoke all on function public.tafa_admin_list_boost_campaigns(integer) from public;
grant execute on function public.tafa_admin_list_boost_campaigns(integer) to authenticated;

create or replace function public.tafa_admin_control_boost_campaign(p_campaign_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
  if p_status not in ('active','paused','rejected','completed') then raise exception 'Statut de campagne invalide'; end if;
  if p_status='active' and not exists(select 1 from public.tafab_ad_campaigns where id=p_campaign_id and payment_status='verified') then
    raise exception 'Paiement non vérifié';
  end if;
  update public.tafab_ad_campaigns
     set status=p_status,
         starts_at=case when p_status='active' then coalesce(starts_at,now()) else starts_at end,
         updated_at=now()
   where id=p_campaign_id;
  return found;
end $$;
revoke all on function public.tafa_admin_control_boost_campaign(uuid,text) from public;
grant execute on function public.tafa_admin_control_boost_campaign(uuid,text) to authenticated;

/* Le propriétaire ne peut pas forcer une campagne payante à active par UPDATE direct. */
drop policy if exists tafab_ad_campaigns_owner_update on public.tafab_ad_campaigns;
create policy tafab_ad_campaigns_owner_update on public.tafab_ad_campaigns
  for update to authenticated
  using(owner_id=auth.uid() or public.tafa_is_admin(auth.uid()))
  with check(owner_id=auth.uid() or public.tafa_is_admin(auth.uid()));

alter table public.tafab_ad_events replica identity full;
DO $$ BEGIN alter publication supabase_realtime add table public.tafab_ad_events; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';

create or replace function public.tafab_guard_campaign_activation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='active' and coalesce(old.status,'')<>'active' and not public.tafa_is_admin(auth.uid()) then
    raise exception 'La campagne doit être validée par l''administration avant sa diffusion.';
  end if;
  return new;
end $$;

drop trigger if exists tafab_guard_campaign_activation on public.tafab_ad_campaigns;
create trigger tafab_guard_campaign_activation
before update on public.tafab_ad_campaigns
for each row execute function public.tafab_guard_campaign_activation();

NOTIFY pgrst, 'reload schema';
