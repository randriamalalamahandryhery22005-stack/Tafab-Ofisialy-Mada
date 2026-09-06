/* =========================================================
   TAFAß MONÉTISATION V1 — REVENUS RÉELS + PORTEFEUILLE + RETRAITS
   Migration additive. Aucune table existante n'est supprimée.
   Les revenus sont inscrits dans un registre immuable et les soldes
   ne peuvent être modifiés par le client via les fonctions sensibles.
   ========================================================= */

create table if not exists public.tafab_creator_monetization (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'not_requested' check (status in ('not_requested','pending','approved','suspended')),
  enabled boolean not null default false,
  reason text,
  revenue_share_percent numeric(5,2) not null default 70 check (revenue_share_percent between 0 and 100),
  min_withdrawal_mga numeric(14,2) not null default 1000 check (min_withdrawal_mga >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tafab_creator_earnings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  gross_mga numeric(14,2) not null check (gross_mga >= 0),
  platform_fee_mga numeric(14,2) not null default 0 check (platform_fee_mga >= 0),
  net_mga numeric(14,2) not null check (net_mga >= 0),
  status text not null default 'available' check (status in ('pending','available','paid','reversed')),
  description text,
  created_at timestamptz not null default now(),
  unique (creator_id, source_type, source_id)
);

create index if not exists tafab_creator_earnings_creator_created_idx
  on public.tafab_creator_earnings(creator_id, created_at desc);

create table if not exists public.tafab_creator_payout_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('mvola','orange_money','airtel_money')),
  phone text not null,
  account_name text not null default '',
  is_default boolean not null default false,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tafab_creator_payout_methods_user_idx
  on public.tafab_creator_payout_methods(user_id, is_default desc, created_at desc);

/* Ajouts compatibles avec le portefeuille existant. */
alter table public.tafab_wallets add column if not exists pending_earnings_mga numeric(14,2) not null default 0;
alter table public.tafab_wallets add column if not exists lifetime_earnings_mga numeric(14,2) not null default 0;
alter table public.tafab_wallets add column if not exists total_withdrawn_mga numeric(14,2) not null default 0;

alter table public.tafab_withdrawal_requests add column if not exists payout_method_id uuid;
alter table public.tafab_withdrawal_requests add column if not exists processed_at timestamptz;
alter table public.tafab_withdrawal_requests add column if not exists admin_note text;

/* Registre serveur : une seule opération source peut créditer un créateur. */
create or replace function public.tafab_record_creator_earning(
  p_creator_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_gross_mga numeric,
  p_description text default null
)
returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;
  v_share numeric;
  v_fee numeric;
  v_net numeric;
begin
  if p_creator_id is null or p_source_type is null or p_source_id is null or coalesce(p_gross_mga,0) <= 0 then
    return null;
  end if;
  select revenue_share_percent into v_share
    from public.tafab_creator_monetization
   where user_id=p_creator_id and status='approved' and enabled=true;
  if v_share is null then return null; end if;
  v_net := round(p_gross_mga * v_share / 100.0, 2);
  v_fee := round(p_gross_mga - v_net, 2);
  insert into public.tafab_creator_earnings(creator_id,source_type,source_id,gross_mga,platform_fee_mga,net_mga,status,description)
  values(p_creator_id,p_source_type,p_source_id,p_gross_mga,v_fee,v_net,'available',p_description)
  on conflict (creator_id,source_type,source_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.tafab_creator_earnings where creator_id=p_creator_id and source_type=p_source_type and source_id=p_source_id limit 1;
    return v_id;
  end if;
  update public.tafab_wallets
     set earnings_mga=coalesce(earnings_mga,0)+v_net,
         lifetime_earnings_mga=coalesce(lifetime_earnings_mga,0)+v_net,
         updated_at=now()
   where user_id=p_creator_id;
  if not found then
    insert into public.tafab_wallets(user_id,coins,earnings_mga,pending_earnings_mga,lifetime_earnings_mga,total_withdrawn_mga)
    values(p_creator_id,0,v_net,0,v_net,0);
  end if;
  return v_id;
end $$;
revoke all on function public.tafab_record_creator_earning(uuid,text,uuid,numeric,text) from public;
grant execute on function public.tafab_record_creator_earning(uuid,text,uuid,numeric,text) to service_role;

/* Les cadeaux Live deviennent un revenu uniquement pour un créateur activé. */
create or replace function public.tafab_credit_live_gift_earning()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_coin_value numeric := 1;
  v_gross numeric;
begin
  if new.receiver_id is null or new.sender_id is null or new.receiver_id=new.sender_id then return new; end if;
  v_gross := greatest(0,coalesce(new.coins,0) * v_coin_value);
  if v_gross > 0 then
    perform public.tafab_record_creator_earning(new.receiver_id,'live_gift',new.id,v_gross,'Cadeau Live');
  end if;
  return new;
end $$;
drop trigger if exists tafab_credit_live_gift_earning on public.tafab_live_gifts;
create trigger tafab_credit_live_gift_earning
after insert on public.tafab_live_gifts
for each row execute function public.tafab_credit_live_gift_earning();

/* Demande d'activation du programme. */
create or replace function public.tafab_request_creator_monetization(p_reason text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  insert into public.tafab_creator_monetization(user_id,status,enabled,reason)
  values(auth.uid(),'pending',false,left(coalesce(p_reason,''),800))
  on conflict (user_id) do update set status=case when public.tafab_creator_monetization.status='suspended' then 'pending' else public.tafab_creator_monetization.status end,
    reason=left(coalesce(p_reason,''),800),updated_at=now();
  return jsonb_build_object('ok',true,'status',(select status from public.tafab_creator_monetization where user_id=auth.uid()));
end $$;
revoke all on function public.tafab_request_creator_monetization(text) from public;
grant execute on function public.tafab_request_creator_monetization(text) to authenticated;

/* Moyen de retrait : le numéro reste uniquement côté compte utilisateur. */
create or replace function public.tafab_save_payout_method(p_provider text,p_phone text,p_account_name text,p_is_default boolean default false)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if p_provider not in ('mvola','orange_money','airtel_money') then raise exception 'Opérateur invalide'; end if;
  if length(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')) < 9 then raise exception 'Numéro invalide'; end if;
  if p_is_default then update public.tafab_creator_payout_methods set is_default=false,updated_at=now() where user_id=auth.uid(); end if;
  insert into public.tafab_creator_payout_methods(user_id,provider,phone,account_name,is_default,status)
  values(auth.uid(),p_provider,left(trim(p_phone),30),left(trim(coalesce(p_account_name,'')),120),p_is_default,'active') returning id into v_id;
  return v_id;
end $$;
revoke all on function public.tafab_save_payout_method(text,text,text,boolean) from public;
grant execute on function public.tafab_save_payout_method(text,text,text,boolean) to authenticated;

/* Retrait atomique : le solde est réservé avant toute intervention admin. */
create or replace function public.tafab_request_creator_withdrawal(p_amount_mga numeric,p_payout_method_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_wallet public.tafab_wallets%rowtype;
  v_min numeric;
  v_provider text;
  v_phone text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select min_withdrawal_mga into v_min from public.tafab_creator_monetization where user_id=auth.uid() and status='approved' and enabled=true;
  if v_min is null then raise exception 'Monétisation non activée'; end if;
  if p_amount_mga < v_min then raise exception 'Montant minimum : % Ar',v_min; end if;
  select provider,phone into v_provider,v_phone from public.tafab_creator_payout_methods where id=p_payout_method_id and user_id=auth.uid() and status='active';
  if v_provider is null then raise exception 'Moyen de retrait introuvable'; end if;
  select * into v_wallet from public.tafab_wallets where user_id=auth.uid() for update;
  if v_wallet.user_id is null or coalesce(v_wallet.earnings_mga,0) < p_amount_mga then raise exception 'Solde disponible insuffisant'; end if;
  update public.tafab_wallets set earnings_mga=earnings_mga-p_amount_mga, pending_earnings_mga=coalesce(pending_earnings_mga,0)+p_amount_mga, updated_at=now() where user_id=auth.uid();
  insert into public.tafab_withdrawal_requests(user_id,amount_mga,method,destination_hint,status,payout_method_id)
  values(auth.uid(),p_amount_mga,'mobile_money',v_phone,'pending',p_payout_method_id) returning id into v_id;
  return v_id;
exception when others then
  raise;
end $$;
revoke all on function public.tafab_request_creator_withdrawal(numeric,uuid) from public;
grant execute on function public.tafab_request_creator_withdrawal(numeric,uuid) to authenticated;

/* Liste admin des retraits créateurs. */
create or replace function public.tafa_admin_list_creator_payouts(p_limit integer default 100)
returns table(id uuid,user_id uuid,amount_mga numeric,method text,destination_hint text,status text,created_at timestamptz,processed_at timestamptz,admin_note text,display_name text)
language sql stable security definer set search_path=public as $$
  select w.id,w.user_id,w.amount_mga,coalesce(pm.provider,w.method),w.destination_hint,w.status,w.created_at,w.processed_at,w.admin_note,
    coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.username,p.email,'Compte')
  from public.tafab_withdrawal_requests w left join public.tafab_creator_payout_methods pm on pm.id=w.payout_method_id left join public.profiles p on p.id=w.user_id
  where public.tafa_is_admin(auth.uid()) and w.payout_method_id is not null
  order by w.created_at desc limit greatest(1,least(p_limit,500));
$$;
revoke all on function public.tafa_admin_list_creator_payouts(integer) from public;
grant execute on function public.tafa_admin_list_creator_payouts(integer) to authenticated;

create or replace function public.tafa_admin_list_creator_monetization(p_limit integer default 100)
returns table(user_id uuid,status text,enabled boolean,lifetime_earnings_mga numeric,created_at timestamptz,display_name text)
language sql stable security definer set search_path=public as $$
  select m.user_id,m.status,m.enabled,coalesce(w.lifetime_earnings_mga,0),m.created_at,
    coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.username,p.email,'Compte')
  from public.tafab_creator_monetization m left join public.tafab_wallets w on w.user_id=m.user_id left join public.profiles p on p.id=m.user_id
  where public.tafa_is_admin(auth.uid())
  order by m.created_at desc limit greatest(1,least(p_limit,500));
$$;
revoke all on function public.tafa_admin_list_creator_monetization(integer) from public;
grant execute on function public.tafa_admin_list_creator_monetization(integer) to authenticated;

create or replace function public.tafa_admin_set_creator_monetization_status(p_user_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
  if p_status not in ('approved','suspended','rejected') then raise exception 'Statut invalide'; end if;
  insert into public.tafab_creator_monetization(user_id,status,enabled)
  values(p_user_id,case when p_status='rejected' then 'suspended' else p_status end,p_status='approved')
  on conflict(user_id) do update set status=case when p_status='rejected' then 'suspended' else p_status end,enabled=(p_status='approved'),updated_at=now();
  return true;
end $$;
revoke all on function public.tafa_admin_set_creator_monetization_status(uuid,text) from public;
grant execute on function public.tafa_admin_set_creator_monetization_status(uuid,text) to authenticated;

/* Paiement admin : paid finalise le retrait ; rejected restitue le solde. */
create or replace function public.tafa_admin_process_creator_payout(p_request_id uuid,p_status text,p_admin_note text default '')
returns boolean language plpgsql security definer set search_path=public as $$
declare v public.tafab_withdrawal_requests%rowtype;
begin
  if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
  if p_status not in ('paid','rejected') then raise exception 'Statut de paiement invalide'; end if;
  select * into v from public.tafab_withdrawal_requests where id=p_request_id and payout_method_id is not null for update;
  if v.id is null then raise exception 'Retrait introuvable'; end if;
  if v.status<>'pending' then raise exception 'Ce retrait a déjà été traité'; end if;
  if p_status='paid' then
    update public.tafab_withdrawal_requests set status='approved',processed_at=now(),admin_note=left(coalesce(p_admin_note,''),500) where id=v.id;
    update public.tafab_wallets set pending_earnings_mga=greatest(0,coalesce(pending_earnings_mga,0)-v.amount_mga),total_withdrawn_mga=coalesce(total_withdrawn_mga,0)+v.amount_mga,updated_at=now() where user_id=v.user_id;
  else
    update public.tafab_withdrawal_requests set status='rejected',processed_at=now(),admin_note=left(coalesce(p_admin_note,''),500) where id=v.id;
    update public.tafab_wallets set pending_earnings_mga=greatest(0,coalesce(pending_earnings_mga,0)-v.amount_mga),earnings_mga=coalesce(earnings_mga,0)+v.amount_mga,updated_at=now() where user_id=v.user_id;
  end if;
  return true;
end $$;
revoke all on function public.tafa_admin_process_creator_payout(uuid,text,text) from public;
grant execute on function public.tafa_admin_process_creator_payout(uuid,text,text) to authenticated;

/* RLS : lecture du compte personnel, écriture sensible via RPC uniquement. */
alter table public.tafab_creator_monetization enable row level security;
alter table public.tafab_creator_earnings enable row level security;
alter table public.tafab_creator_payout_methods enable row level security;

drop policy if exists tafab_creator_monetization_self_select on public.tafab_creator_monetization;
create policy tafab_creator_monetization_self_select on public.tafab_creator_monetization for select to authenticated using(user_id=auth.uid() or public.tafa_is_admin(auth.uid()));
drop policy if exists tafab_creator_earnings_self_select on public.tafab_creator_earnings;
create policy tafab_creator_earnings_self_select on public.tafab_creator_earnings for select to authenticated using(creator_id=auth.uid() or public.tafa_is_admin(auth.uid()));
drop policy if exists tafab_creator_payout_methods_self_select on public.tafab_creator_payout_methods;
create policy tafab_creator_payout_methods_self_select on public.tafab_creator_payout_methods for select to authenticated using(user_id=auth.uid() or public.tafa_is_admin(auth.uid()));

/* Realtime pour le portefeuille et les retraits. */
DO $$ BEGIN alter publication supabase_realtime add table public.tafab_creator_monetization; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter publication supabase_realtime add table public.tafab_creator_earnings; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter publication supabase_realtime add table public.tafab_creator_payout_methods; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter publication supabase_realtime add table public.tafab_withdrawal_requests; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
