/* =========================================================
   TAFAß ADS V1 — BOOST PREMIUM / PAIEMENT / CIBLAGE / DIFFUSION
   Migration additive : aucune donnée existante n'est supprimée.
   Les campagnes actives sont validées par l'administration.
   ========================================================= */

alter table public.tafab_ad_campaigns add column if not exists post_id uuid references public.posts(id) on delete cascade;
alter table public.tafab_ad_campaigns add column if not exists page_id uuid references public.pages(id) on delete cascade;
alter table public.tafab_ad_campaigns add column if not exists ad_type text not null default 'custom';
alter table public.tafab_ad_campaigns add column if not exists payment_status text not null default 'unpaid';
alter table public.tafab_ad_campaigns add column if not exists amount_paid_mga bigint not null default 0;
alter table public.tafab_ad_campaigns add column if not exists spent_amount_mga bigint not null default 0;
alter table public.tafab_ad_campaigns add column if not exists target_gender text not null default 'all';
alter table public.tafab_ad_campaigns add column if not exists max_frequency integer not null default 2;
alter table public.tafab_ad_campaigns add column if not exists billing_mode text not null default 'budget';
alter table public.tafab_ad_campaigns add column if not exists billing_rate_mga bigint not null default 0;

create index if not exists tafab_ad_campaigns_delivery_idx
  on public.tafab_ad_campaigns(status, starts_at, ends_at, created_at desc);
create index if not exists tafab_ad_campaigns_post_idx on public.tafab_ad_campaigns(post_id);
create index if not exists tafab_ad_campaigns_page_idx on public.tafab_ad_campaigns(page_id);

create table if not exists public.tafab_ad_payments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.tafab_ad_campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  method text not null check(method in ('Airtel Money','Yas Money')),
  amount_mga bigint not null check(amount_mga > 0),
  transaction_reference text not null,
  status text not null default 'pending' check(status in ('pending','verified','rejected','cancelled')),
  note text default '',
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null
);
create index if not exists tafab_ad_payments_campaign_idx on public.tafab_ad_payments(campaign_id,created_at desc);
create index if not exists tafab_ad_payments_status_idx on public.tafab_ad_payments(status,created_at desc);

alter table public.tafab_ad_payments enable row level security;
drop policy if exists tafab_ad_payments_owner_select on public.tafab_ad_payments;
create policy tafab_ad_payments_owner_select on public.tafab_ad_payments
  for select to authenticated using(user_id=auth.uid() or public.tafa_is_admin(auth.uid()));
drop policy if exists tafab_ad_payments_owner_insert on public.tafab_ad_payments;
create policy tafab_ad_payments_owner_insert on public.tafab_ad_payments
  for insert to authenticated with check(user_id=auth.uid());

/* Le propriétaire ne peut plus forcer directement une campagne en active.
   Les transitions sensibles passent par les RPC ci-dessous. */
drop policy if exists tafab_ad_campaigns_own on public.tafab_ad_campaigns;
create policy tafab_ad_campaigns_own on public.tafab_ad_campaigns
  for select to authenticated using(owner_id=auth.uid() or public.tafa_is_admin(auth.uid()));

drop policy if exists tafab_ad_campaigns_owner_insert on public.tafab_ad_campaigns;
create policy tafab_ad_campaigns_owner_insert on public.tafab_ad_campaigns
  for insert to authenticated with check(owner_id=auth.uid());

drop policy if exists tafab_ad_campaigns_owner_update on public.tafab_ad_campaigns;
create policy tafab_ad_campaigns_owner_update on public.tafab_ad_campaigns
  for update to authenticated
  using(owner_id=auth.uid() or public.tafa_is_admin(auth.uid()))
  with check(owner_id=auth.uid() or public.tafa_is_admin(auth.uid()));

drop policy if exists tafab_ad_campaigns_owner_delete on public.tafab_ad_campaigns;
create policy tafab_ad_campaigns_owner_delete on public.tafab_ad_campaigns
  for delete to authenticated using(owner_id=auth.uid() or public.tafa_is_admin(auth.uid()));

create or replace function public.tafa_create_boost_campaign(
  p_post_id uuid default null,
  p_page_id uuid default null,
  p_ad_type text default 'post',
  p_objective text default 'awareness',
  p_name text default 'Boost Tafaß',
  p_daily_budget_mga bigint default 0,
  p_total_budget_mga bigint default 0,
  p_audience_location text default 'Madagascar',
  p_age_min integer default 18,
  p_age_max integer default 65,
  p_gender text default 'all',
  p_starts_at timestamptz default now(),
  p_ends_at timestamptz default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_owner uuid; v_page_owner uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if p_total_budget_mga <= 0 then raise exception 'Le budget total doit être supérieur à 0 Ar'; end if;
  if p_age_min < 13 or p_age_max > 100 or p_age_min > p_age_max then raise exception 'Tranche d''âge invalide'; end if;
  if p_gender not in ('all','male','female') then raise exception 'Ciblage de genre invalide'; end if;
  if p_ad_type not in ('post','reel','video','photo','page_followers','custom') then raise exception 'Type de publicité invalide'; end if;
  if p_page_id is not null then
    select owner_id into v_page_owner from public.pages where id=p_page_id;
    if v_page_owner is null or (v_page_owner<>auth.uid() and not public.tafa_is_admin(auth.uid())) then raise exception 'Accès à la Page refusé'; end if;
  end if;
  if p_post_id is not null then
    select user_id into v_owner from public.posts where id=p_post_id;
    if v_owner is null or (v_owner<>auth.uid() and not public.tafa_is_admin(auth.uid())) then raise exception 'Accès à la publication refusé'; end if;
  end if;
  insert into public.tafab_ad_campaigns(
    owner_id,post_id,page_id,ad_type,objective,name,status,payment_status,
    daily_budget_mga,total_budget_mga,audience_location,audience_age_min,audience_age_max,
    target_gender,starts_at,ends_at
  ) values(
    auth.uid(),p_post_id,p_page_id,p_ad_type,p_objective,left(trim(p_name),120),'draft','unpaid',
    greatest(0,p_daily_budget_mga),p_total_budget_mga,coalesce(nullif(trim(p_audience_location),''),'Madagascar'),
    p_age_min,p_age_max,p_gender,p_starts_at,p_ends_at
  ) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.tafa_create_boost_campaign(uuid,uuid,text,text,text,bigint,bigint,text,integer,integer,text,timestamptz,timestamptz) from public;
grant execute on function public.tafa_create_boost_campaign(uuid,uuid,text,text,text,bigint,bigint,text,integer,integer,text,timestamptz,timestamptz) to authenticated;

create or replace function public.tafa_submit_boost_payment(
  p_campaign_id uuid, p_method text, p_amount_mga bigint, p_reference text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_owner uuid; v_budget bigint;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if p_method not in ('Airtel Money','Yas Money') then raise exception 'Méthode de paiement invalide'; end if;
  if p_amount_mga <= 0 then raise exception 'Montant invalide'; end if;
  select owner_id,total_budget_mga into v_owner,v_budget from public.tafab_ad_campaigns where id=p_campaign_id for update;
  if v_owner is null or v_owner<>auth.uid() then raise exception 'Campagne introuvable'; end if;
  if p_amount_mga<>v_budget then raise exception 'Le paiement doit correspondre exactement au budget total'; end if;
  if exists(select 1 from public.tafab_ad_payments where campaign_id=p_campaign_id and status='pending') then raise exception 'Un paiement est déjà en attente pour cette campagne'; end if;
  insert into public.tafab_ad_payments(campaign_id,user_id,method,amount_mga,transaction_reference)
  values(p_campaign_id,auth.uid(),p_method,p_amount_mga,left(trim(p_reference),160)) returning id into v_id;
  update public.tafab_ad_campaigns set payment_status='pending',status='payment_pending',updated_at=now() where id=p_campaign_id;
  return v_id;
end $$;
revoke all on function public.tafa_submit_boost_payment(uuid,text,bigint,text) from public;
grant execute on function public.tafa_submit_boost_payment(uuid,text,bigint,text) to authenticated;

create or replace function public.tafa_admin_list_boost_payments(p_limit integer default 100)
returns table(id uuid,campaign_id uuid,user_id uuid,display_name text,campaign_name text,method text,amount_mga bigint,transaction_reference text,status text,created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select ap.id,ap.campaign_id,ap.user_id,
    coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.username,p.email,'Compte'),
    c.name,ap.method,ap.amount_mga,ap.transaction_reference,ap.status,ap.created_at
  from public.tafab_ad_payments ap
  join public.tafab_ad_campaigns c on c.id=ap.campaign_id
  left join public.profiles p on p.id=ap.user_id
  where public.tafa_is_admin(auth.uid())
  order by ap.created_at desc limit greatest(1,least(p_limit,200));
$$;
revoke all on function public.tafa_admin_list_boost_payments(integer) from public;
grant execute on function public.tafa_admin_list_boost_payments(integer) to authenticated;

create or replace function public.tafa_admin_review_boost_payment(p_payment_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_campaign uuid; v_amount bigint; v_owner uuid;
begin
  if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
  if p_status not in ('verified','rejected') then raise exception 'Statut de paiement invalide'; end if;
  select campaign_id,amount_mga into v_campaign,v_amount from public.tafab_ad_payments where id=p_payment_id and status='pending' for update;
  if v_campaign is null then raise exception 'Paiement introuvable ou déjà traité'; end if;
  select owner_id into v_owner from public.tafab_ad_campaigns where id=v_campaign for update;
  if p_status='verified' then
    update public.tafab_ad_payments set status='verified',verified_at=now(),verified_by=auth.uid() where id=p_payment_id;
    update public.tafab_ad_campaigns set payment_status='verified',amount_paid_mga=v_amount,status='pending_review',updated_at=now() where id=v_campaign;
  else
    update public.tafab_ad_payments set status='rejected',verified_at=now(),verified_by=auth.uid() where id=p_payment_id;
    update public.tafab_ad_campaigns set payment_status='rejected',status='rejected',updated_at=now() where id=v_campaign;
  end if;
  return true;
end $$;
revoke all on function public.tafa_admin_review_boost_payment(uuid,text) from public;
grant execute on function public.tafa_admin_review_boost_payment(uuid,text) to authenticated;

create or replace function public.tafa_admin_review_boost_campaign(p_campaign_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
  if p_status not in ('active','rejected','paused') then raise exception 'Statut de campagne invalide'; end if;
  if p_status='active' and not exists(select 1 from public.tafab_ad_campaigns where id=p_campaign_id and payment_status='verified') then raise exception 'Paiement non vérifié'; end if;
  update public.tafab_ad_campaigns set status=p_status,starts_at=coalesce(starts_at,now()),updated_at=now() where id=p_campaign_id;
  return found;
end $$;
revoke all on function public.tafa_admin_review_boost_campaign(uuid,text) from public;
grant execute on function public.tafa_admin_review_boost_campaign(uuid,text) to authenticated;

create or replace function public.tafa_get_sponsored_ads(p_limit integer default 2)
returns table(
  campaign_id uuid, ad_type text, objective text, owner_id uuid, page_id uuid, post_id uuid,
  title text, description text, media_url text, media_type text, target_url text,
  page_name text, page_logo_url text
) language sql stable security definer set search_path=public as $$
  select c.id,c.ad_type,c.objective,c.owner_id,c.page_id,c.post_id,
    coalesce(nullif(c.creative_title,''),p.content,nullif(c.name,''),'Publicité Tafaß'),
    coalesce(c.creative_description,''),
    coalesce(c.image_url,p.media_url,pg.logo_url),p.media_type,c.target_url,
    pg.name,pg.logo_url
  from public.tafab_ad_campaigns c
  left join public.posts p on p.id=c.post_id
  left join public.pages pg on pg.id=c.page_id
  left join public.profiles me on me.id=auth.uid()
  where c.status='active'
    and c.payment_status='verified'
    and c.owner_id<>auth.uid()
    and (c.starts_at is null or c.starts_at<=now())
    and (c.ends_at is null or c.ends_at>now())
    and c.spent_amount_mga < greatest(c.total_budget_mga,c.amount_paid_mga)
    and coalesce(c.audience_age_min,13) <= coalesce(extract(year from age(current_date,me.birth)),99)
    and coalesce(c.audience_age_max,100) >= coalesce(extract(year from age(current_date,me.birth)),99)
    and (coalesce(c.target_gender,'all')='all' or lower(coalesce(me.gender,'')) = case when c.target_gender='male' then 'homme' when c.target_gender='female' then 'femme' else lower(c.target_gender) end)
    and (coalesce(c.audience_location,'Madagascar')='Madagascar' or lower(coalesce(me.city_current,me.location,''))=lower(c.audience_location))
    and not exists(
      select 1 from public.tafab_ad_events e
      where e.campaign_id=c.id and e.user_id=auth.uid() and e.event_type='impression'
        and e.created_at>now()-interval '24 hours'
      having count(*) >= greatest(1,c.max_frequency)
    )
  order by c.created_at desc
  limit greatest(1,least(p_limit,5));
$$;
revoke all on function public.tafa_get_sponsored_ads(integer) from public;
grant execute on function public.tafa_get_sponsored_ads(integer) to authenticated;

create or replace function public.tafab_register_ad_event(p_campaign_id uuid,p_event_type text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_rate bigint; v_budget bigint; v_spent bigint;
begin
  if p_event_type not in ('impression','click') then raise exception 'Invalid ad event'; end if;
  select coalesce(billing_rate_mga,0),total_budget_mga,spent_amount_mga into v_rate,v_budget,v_spent
  from public.tafab_ad_campaigns where id=p_campaign_id and status='active' and payment_status='verified' for update;
  if v_budget is null then return false; end if;
  if v_rate>0 and v_spent+v_rate>v_budget then return false; end if;
  insert into public.tafab_ad_events(campaign_id,user_id,event_type) values(p_campaign_id,auth.uid(),p_event_type);
  if v_rate>0 then update public.tafab_ad_campaigns set spent_amount_mga=least(v_budget,v_spent+v_rate),updated_at=now() where id=p_campaign_id; end if;
  return true;
end $$;
revoke all on function public.tafab_register_ad_event(uuid,text) from public;
grant execute on function public.tafab_register_ad_event(uuid,text) to authenticated;

alter table public.tafab_ad_payments replica identity full;
alter table public.tafab_ad_campaigns replica identity full;
DO $$ BEGIN alter publication supabase_realtime add table public.tafab_ad_payments; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter publication supabase_realtime add table public.tafab_ad_campaigns; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
