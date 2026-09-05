-- Tafaß V26 — Business + Ads ecosystem
create table if not exists public.tafab_business_profiles (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null, category text default 'Entreprise', description text default '', website text,
  phone text, location text, logo_url text, verified boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists tafab_business_profiles_owner_uidx on public.tafab_business_profiles(owner_id);

alter table public.tafab_ads add column if not exists campaign_id uuid;
create unique index if not exists tafab_ads_campaign_uidx on public.tafab_ads(campaign_id) where campaign_id is not null;

create table if not exists public.tafab_ad_campaigns (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid references public.tafab_business_profiles(id) on delete set null,
  name text not null, creative_title text, creative_description text default '', target_url text, image_url text, objective text not null default 'awareness', status text not null default 'draft',
  daily_budget_mga bigint not null default 0 check (daily_budget_mga >= 0), total_budget_mga bigint not null default 0 check (total_budget_mga >= 0),
  audience_location text default 'Madagascar', audience_age_min integer default 18 check (audience_age_min between 13 and 100),
  audience_age_max integer default 65 check (audience_age_max between 13 and 100), audience_interests text[] default '{}',
  starts_at timestamptz, ends_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists tafab_ad_campaigns_owner_idx on public.tafab_ad_campaigns(owner_id, created_at desc);

create table if not exists public.tafab_ad_events (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.tafab_ad_campaigns(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null, event_type text not null check(event_type in ('impression','click')),
  created_at timestamptz not null default now()
);
create index if not exists tafab_ad_events_campaign_idx on public.tafab_ad_events(campaign_id, created_at desc);

alter table public.tafab_business_profiles enable row level security;
alter table public.tafab_ad_campaigns enable row level security;
alter table public.tafab_ad_events enable row level security;

drop policy if exists tafab_business_profiles_select on public.tafab_business_profiles;
create policy tafab_business_profiles_select on public.tafab_business_profiles for select to authenticated using (owner_id=auth.uid() or verified=true);
drop policy if exists tafab_business_profiles_own on public.tafab_business_profiles;
create policy tafab_business_profiles_own on public.tafab_business_profiles for all to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());

drop policy if exists tafab_ad_campaigns_own on public.tafab_ad_campaigns;
create policy tafab_ad_campaigns_own on public.tafab_ad_campaigns for all to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());

drop policy if exists tafab_ad_events_owner_select on public.tafab_ad_events;
create policy tafab_ad_events_owner_select on public.tafab_ad_events for select to authenticated using (exists(select 1 from public.tafab_ad_campaigns c where c.id=campaign_id and c.owner_id=auth.uid()));
-- Events are written only through the RPCs below to prevent fake analytics.

create or replace function public.tafab_register_ad_event(p_campaign_id uuid, p_event_type text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if p_event_type not in ('impression','click') then raise exception 'Invalid ad event'; end if;
  if not exists(select 1 from public.tafab_ad_campaigns where id=p_campaign_id and status='active') then return false; end if;
  insert into public.tafab_ad_events(campaign_id,user_id,event_type) values(p_campaign_id,auth.uid(),p_event_type);
  return true;
end; $$;
revoke all on function public.tafab_register_ad_event(uuid,text) from public;
grant execute on function public.tafab_register_ad_event(uuid,text) to authenticated;

create or replace function public.tafab_ad_campaign_stats(p_campaign_id uuid)
returns table(impressions bigint, clicks bigint, ctr numeric) language sql security definer set search_path=public as $$
  select count(*) filter(where event_type='impression'), count(*) filter(where event_type='click'),
    case when count(*) filter(where event_type='impression')=0 then 0 else round((100.0*count(*) filter(where event_type='click')/count(*) filter(where event_type='impression'))::numeric,2) end
  from public.tafab_ad_events e join public.tafab_ad_campaigns c on c.id=e.campaign_id
  where e.campaign_id=p_campaign_id and c.owner_id=auth.uid();
$$;
revoke all on function public.tafab_ad_campaign_stats(uuid) from public;
grant execute on function public.tafab_ad_campaign_stats(uuid) to authenticated;

alter table public.tafab_business_profiles replica identity full;
alter table public.tafab_ad_campaigns replica identity full;
DO $$ BEGIN alter publication supabase_realtime add table public.tafab_business_profiles; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter publication supabase_realtime add table public.tafab_ad_campaigns; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter publication supabase_realtime add table public.tafab_ad_events; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
