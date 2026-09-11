/* ============================================================
   TAFAß V83.3 — REAL WITHDRAWAL TRACKING + MOBILE MONEY PAYOUT CORE
   Additive production hardening.

   Supports payout destinations:
     - MVola
     - Orange Money
     - Airtel Money

   IMPORTANT:
   This migration never pretends that a payout happened. A withdrawal is
   marked PAID only after the server-side payout provider confirms it and
   returns a transaction reference.
   ============================================================ */

/* ---------- Creator withdrawals ---------- */
alter table public.tafab_withdrawal_requests
  add column if not exists last_attempt_at timestamptz,
  add column if not exists paid_at timestamptz;

alter table public.tafab_withdrawal_requests
  drop constraint if exists tafab_withdrawal_requests_status_check;
alter table public.tafab_withdrawal_requests
  add constraint tafab_withdrawal_requests_status_check
  check (status in ('pending','approved','processing','paid','failed','rejected'));

create index if not exists tafab_withdrawal_status_created_idx
  on public.tafab_withdrawal_requests(status,created_at desc);

/* ---------- Platform/admin wallet ---------- */
alter table public.tafa_platform_wallets_v74
  add column if not exists pending_earnings_mga numeric(18,2) not null default 0;

alter table public.tafa_admin_withdrawals_v74
  add column if not exists provider_reference text,
  add column if not exists payout_attempts integer not null default 0,
  add column if not exists last_payout_error text,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists paid_at timestamptz;

alter table public.tafa_admin_withdrawals_v74
  drop constraint if exists tafa_admin_withdrawals_v74_status_check;
alter table public.tafa_admin_withdrawals_v74
  add constraint tafa_admin_withdrawals_v74_status_check
  check (status in ('pending','processing','paid','failed','rejected'));

create unique index if not exists tafa_admin_withdrawals_provider_reference_uq
  on public.tafa_admin_withdrawals_v74(provider_reference)
  where provider_reference is not null;
create index if not exists tafa_admin_withdrawals_status_created_idx
  on public.tafa_admin_withdrawals_v74(status,created_at desc);

/* ---------- Creator request: reserve money only ---------- */
create or replace function public.tafab_request_creator_withdrawal(
  p_amount_mga numeric,
  p_payout_method_id uuid
)
returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_wallet public.tafab_wallets%rowtype;
  v_min numeric;
  v_provider text;
  v_phone text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select min_withdrawal_mga into v_min
    from public.tafab_creator_monetization
   where user_id=auth.uid() and status='approved' and enabled=true;
  if v_min is null then raise exception 'Monétisation non activée'; end if;
  if coalesce(p_amount_mga,0) < v_min then raise exception 'Montant minimum : % Ar',v_min; end if;

  select provider,phone into v_provider,v_phone
    from public.tafab_creator_payout_methods
   where id=p_payout_method_id and user_id=auth.uid() and status='active';
  if v_provider is null then raise exception 'Moyen de retrait introuvable'; end if;
  if v_provider not in ('mvola','orange_money','airtel_money') then
    raise exception 'Choisissez MVola, Orange Money ou Airtel Money';
  end if;

  select * into v_wallet
    from public.tafab_wallets
   where user_id=auth.uid()
   for update;
  if v_wallet.user_id is null or coalesce(v_wallet.earnings_mga,0) < p_amount_mga then
    raise exception 'Solde disponible insuffisant';
  end if;

  update public.tafab_wallets
     set earnings_mga=earnings_mga-p_amount_mga,
         pending_earnings_mga=coalesce(pending_earnings_mga,0)+p_amount_mga,
         updated_at=now()
   where user_id=auth.uid();

  insert into public.tafab_withdrawal_requests(
    user_id,amount_mga,method,destination_hint,status,payout_method_id,payout_attempts
  ) values (
    auth.uid(),p_amount_mga,'mobile_money',v_provider||' · '||right(regexp_replace(v_phone,'[^0-9]','','g'),4),
    'pending',p_payout_method_id,0
  ) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.tafab_request_creator_withdrawal(numeric,uuid) from public;
grant execute on function public.tafab_request_creator_withdrawal(numeric,uuid) to authenticated;

/* ---------- Creator payout state transitions ---------- */
create or replace function public.tafa_mark_creator_payout_processing(
  p_request_id uuid
) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
  update public.tafab_withdrawal_requests
     set status='processing',last_attempt_at=now(),payout_attempts=coalesce(payout_attempts,0)+1
   where id=p_request_id and status in ('pending','approved','processing','failed');
  if not found then raise exception 'Retrait introuvable ou déjà traité'; end if;
  return true;
end $$;
revoke all on function public.tafa_mark_creator_payout_processing(uuid) from public;
grant execute on function public.tafa_mark_creator_payout_processing(uuid) to service_role,authenticated;

create or replace function public.tafa_finalize_creator_payout(
  p_request_id uuid,
  p_external_reference text,
  p_provider_status text default 'success'
) returns boolean
language plpgsql security definer set search_path=public as $$
declare
  v public.tafab_withdrawal_requests%rowtype;
  v_is_service boolean := coalesce(current_setting('request.jwt.claim.role', true),'')='service_role';
begin
  if not v_is_service and not public.tafa_is_admin(auth.uid()) then raise exception 'Accès paiement requis'; end if;
  select * into v from public.tafab_withdrawal_requests where id=p_request_id for update;
  if v.id is null then raise exception 'Retrait introuvable'; end if;
  if v.status not in ('pending','approved','processing','failed') then raise exception 'Retrait déjà traité'; end if;
  if lower(coalesce(p_provider_status,'')) not in ('success','succeeded','paid','completed') then raise exception 'Paiement externe non confirmé'; end if;
  if nullif(trim(coalesce(p_external_reference,'')),'') is null then raise exception 'Référence externe obligatoire'; end if;
  update public.tafab_withdrawal_requests
     set status='paid',processed_at=now(),paid_at=now(),provider_reference=left(trim(p_external_reference),180),last_payout_error=null
   where id=v.id;
  update public.tafab_wallets
     set pending_earnings_mga=greatest(0,coalesce(pending_earnings_mga,0)-v.amount_mga),
         total_withdrawn_mga=coalesce(total_withdrawn_mga,0)+v.amount_mga,
         updated_at=now()
   where user_id=v.user_id;
  return true;
end $$;
revoke all on function public.tafa_finalize_creator_payout(uuid,text,text) from public;
grant execute on function public.tafa_finalize_creator_payout(uuid,text,text) to service_role,authenticated;

create or replace function public.tafa_reject_creator_payout_v67_3(
  p_request_id uuid,p_admin_note text default ''
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v public.tafab_withdrawal_requests%rowtype;
begin
  if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
  select * into v from public.tafab_withdrawal_requests where id=p_request_id for update;
  if v.id is null or v.status not in ('pending','approved','processing','failed') then raise exception 'Retrait introuvable ou déjà traité'; end if;
  update public.tafab_withdrawal_requests
     set status='rejected',processed_at=now(),admin_note=left(coalesce(p_admin_note,''),500)
   where id=v.id;
  update public.tafab_wallets
     set pending_earnings_mga=greatest(0,coalesce(pending_earnings_mga,0)-v.amount_mga),
         earnings_mga=coalesce(earnings_mga,0)+v.amount_mga,
         updated_at=now()
   where user_id=v.user_id;
  return true;
end $$;
revoke all on function public.tafa_reject_creator_payout_v67_3(uuid,text) from public;
grant execute on function public.tafa_reject_creator_payout_v67_3(uuid,text) to authenticated;

/* ---------- Platform/admin withdrawal: reserve, do not fake a payment ---------- */
create or replace function public.tafa_admin_request_platform_withdrawal_v74(
  p_amount_mga numeric,
  p_payout_method_id uuid
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  aid uuid := auth.uid();
  wid uuid;
  v_balance numeric;
begin
  if aid is null or not public.tafa_v74_is_admin(aid) then raise exception 'Accès administrateur requis'; end if;
  if coalesce(p_amount_mga,0) < 1000 then raise exception 'Minimum de retrait : 1 000 Ar'; end if;
  if not exists (
    select 1 from public.tafab_creator_payout_methods pm
     where pm.id=p_payout_method_id and pm.user_id=aid and pm.status='active'
       and pm.provider in ('mvola','orange_money','airtel_money')
  ) then raise exception 'Moyen Mobile Money actif introuvable'; end if;

  select w.earnings_mga into v_balance
    from public.tafa_platform_wallets_v74 w
   where w.user_id=aid for update;
  if v_balance is null or v_balance < p_amount_mga then raise exception 'Solde disponible insuffisant'; end if;

  update public.tafa_platform_wallets_v74
     set earnings_mga=earnings_mga-p_amount_mga,
         pending_earnings_mga=coalesce(pending_earnings_mga,0)+p_amount_mga,
         updated_at=now()
   where user_id=aid;

  insert into public.tafa_admin_withdrawals_v74(admin_user_id,amount_mga,payout_method_id,status,payout_attempts)
  values(aid,p_amount_mga,p_payout_method_id,'pending',0)
  returning id into wid;
  return wid;
end $$;
revoke all on function public.tafa_admin_request_platform_withdrawal_v74(numeric,uuid) from public;
grant execute on function public.tafa_admin_request_platform_withdrawal_v74(numeric,uuid) to authenticated;

create or replace function public.tafa_mark_platform_payout_processing(
  p_request_id uuid
) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  if not public.tafa_v74_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
  update public.tafa_admin_withdrawals_v74
     set status='processing',last_attempt_at=now(),payout_attempts=coalesce(payout_attempts,0)+1
   where id=p_request_id and admin_user_id=auth.uid() and status in ('pending','processing','failed');
  if not found then raise exception 'Retrait plateforme introuvable ou déjà traité'; end if;
  return true;
end $$;
revoke all on function public.tafa_mark_platform_payout_processing(uuid) from public;
grant execute on function public.tafa_mark_platform_payout_processing(uuid) to service_role,authenticated;

create or replace function public.tafa_finalize_platform_payout(
  p_request_id uuid,
  p_external_reference text,
  p_provider_status text default 'success'
) returns boolean
language plpgsql security definer set search_path=public as $$
declare
  v public.tafa_admin_withdrawals_v74%rowtype;
  v_is_service boolean := coalesce(current_setting('request.jwt.claim.role', true),'')='service_role';
begin
  if not v_is_service and not public.tafa_v74_is_admin(auth.uid()) then raise exception 'Accès paiement requis'; end if;
  select * into v from public.tafa_admin_withdrawals_v74 where id=p_request_id for update;
  if v.id is null then raise exception 'Retrait plateforme introuvable'; end if;
  if v.status not in ('pending','processing','failed') then raise exception 'Retrait déjà traité'; end if;
  if lower(coalesce(p_provider_status,'')) not in ('success','succeeded','paid','completed') then raise exception 'Paiement externe non confirmé'; end if;
  if nullif(trim(coalesce(p_external_reference,'')),'') is null then raise exception 'Référence externe obligatoire'; end if;
  update public.tafa_admin_withdrawals_v74
     set status='paid',processed_at=now(),paid_at=now(),provider_reference=left(trim(p_external_reference),180),last_payout_error=null
   where id=v.id;
  update public.tafa_platform_wallets_v74
     set pending_earnings_mga=greatest(0,coalesce(pending_earnings_mga,0)-v.amount_mga),
         total_withdrawn_mga=coalesce(total_withdrawn_mga,0)+v.amount_mga,
         updated_at=now()
   where user_id=v.admin_user_id;
  return true;
end $$;
revoke all on function public.tafa_finalize_platform_payout(uuid,text,text) from public;
grant execute on function public.tafa_finalize_platform_payout(uuid,text,text) to service_role,authenticated;

create or replace function public.tafa_reject_platform_payout(
  p_request_id uuid,p_admin_note text default ''
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v public.tafa_admin_withdrawals_v74%rowtype;
begin
  if not public.tafa_v74_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
  select * into v from public.tafa_admin_withdrawals_v74 where id=p_request_id and admin_user_id=auth.uid() for update;
  if v.id is null or v.status not in ('pending','processing','failed') then raise exception 'Retrait introuvable ou déjà traité'; end if;
  update public.tafa_admin_withdrawals_v74
     set status='rejected',processed_at=now(),admin_note=left(coalesce(p_admin_note,''),500)
   where id=v.id;
  update public.tafa_platform_wallets_v74
     set pending_earnings_mga=greatest(0,coalesce(pending_earnings_mga,0)-v.amount_mga),
         earnings_mga=coalesce(earnings_mga,0)+v.amount_mga,
         updated_at=now()
   where user_id=v.admin_user_id;
  return true;
end $$;
revoke all on function public.tafa_reject_platform_payout(uuid,text) from public;
grant execute on function public.tafa_reject_platform_payout(uuid,text) to authenticated;

/* Realtime history */
do $$ begin
  begin alter publication supabase_realtime add table public.tafa_admin_withdrawals_v74; exception when duplicate_object then null; when undefined_object then null; end;
  begin alter publication supabase_realtime add table public.tafab_withdrawal_requests; exception when duplicate_object then null; when undefined_object then null; end;
end $$;

notify pgrst,'reload schema';
select 'TAFAß V83.3 REAL WITHDRAWAL TRACKING READY' as status;

-- V83.4: safe reconciliation for legacy platform withdrawals created by the old V74 flow.
-- It is deliberately explicit: an admin must confirm that the pending request was never paid.
create or replace function public.tafa_reconcile_legacy_platform_withdrawal(
  p_request_id uuid,
  p_confirm boolean default false
) returns boolean
language plpgsql security definer set search_path=public as $$
declare
  v_req public.tafa_admin_withdrawals_v74%rowtype;
  v_wallet public.tafa_platform_wallets_v74%rowtype;
  v_role text := coalesce(current_setting('request.jwt.claim.role', true),'');
begin
  if v_role <> 'service_role' and not public.tafa_v74_is_admin(auth.uid()) then
    raise exception 'Accès administrateur requis';
  end if;
  if not coalesce(p_confirm,false) then
    raise exception 'Confirmation requise';
  end if;

  select * into v_req
  from public.tafa_admin_withdrawals_v74
  where id=p_request_id and admin_user_id=auth.uid()
  for update;

  if v_req.id is null then raise exception 'Retrait plateforme introuvable'; end if;
  if v_req.status <> 'pending' then raise exception 'Seuls les retraits encore en attente peuvent être corrigés'; end if;
  if nullif(trim(coalesce(v_req.provider_reference,'')),'') is not null then
    raise exception 'Une référence prestataire existe déjà : vérifiez le paiement avant toute correction';
  end if;
  if coalesce(v_req.payout_attempts,0) > 0 then
    raise exception 'Ce retrait a déjà fait l’objet d’une tentative de paiement';
  end if;
  if v_req.processed_at is not null or v_req.paid_at is not null then
    raise exception 'Ce retrait possède déjà une date de traitement';
  end if;

  select * into v_wallet
  from public.tafa_platform_wallets_v74
  where user_id=v_req.admin_user_id
  for update;

  if v_wallet.user_id is null then raise exception 'Portefeuille plateforme introuvable'; end if;
  if coalesce(v_wallet.pending_earnings_mga,0) <> 0 then
    raise exception 'Le portefeuille contient déjà un montant en traitement : vérification manuelle requise';
  end if;
  if coalesce(v_wallet.total_withdrawn_mga,0) < v_req.amount_mga then
    raise exception 'Le total retiré ne contient pas ce montant : vérification manuelle requise';
  end if;

  update public.tafa_platform_wallets_v74
     set total_withdrawn_mga=greatest(0,coalesce(total_withdrawn_mga,0)-v_req.amount_mga),
         pending_earnings_mga=coalesce(pending_earnings_mga,0)+v_req.amount_mga,
         updated_at=now()
   where user_id=v_req.admin_user_id;

  update public.tafa_admin_withdrawals_v74
     set last_payout_error='Ancien retrait V74 corrigé : montant remis en traitement, paiement non confirmé.',
         last_attempt_at=now()
   where id=v_req.id;

  return true;
end $$;
revoke all on function public.tafa_reconcile_legacy_platform_withdrawal(uuid,boolean) from public;
grant execute on function public.tafa_reconcile_legacy_platform_withdrawal(uuid,boolean) to authenticated;

-- ================================================================
-- V83.5 — MOBILE MONEY PROVIDER READINESS (MVola / Orange / Airtel)
-- ================================================================
-- Secrets/endpoints are intentionally NOT stored in the database.
-- Configure them as Supabase Edge Function secrets.

create table if not exists public.tafa_payout_provider_health (
  provider text primary key check (provider in ('mvola','orange_money','airtel_money')),
  enabled boolean not null default false,
  environment text not null default 'sandbox' check (environment in ('sandbox','production')),
  last_checked_at timestamptz,
  last_status text,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.tafa_payout_provider_health(provider) values
 ('mvola'),('orange_money'),('airtel_money')
on conflict (provider) do nothing;

alter table public.tafa_payout_provider_health enable row level security;
drop policy if exists "payout provider health admin select" on public.tafa_payout_provider_health;
create policy "payout provider health admin select"
on public.tafa_payout_provider_health for select to authenticated
using (public.tafa_v74_is_admin(auth.uid()));

grant select on public.tafa_payout_provider_health to authenticated;
revoke all on public.tafa_payout_provider_health from anon;

create or replace function public.tafa_set_payout_provider_health(
  p_provider text,
  p_enabled boolean,
  p_environment text,
  p_status text default null,
  p_error text default null
) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  if not public.tafa_v74_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
  if lower(p_provider) not in ('mvola','orange_money','airtel_money') then raise exception 'Provider invalide'; end if;
  if lower(p_environment) not in ('sandbox','production') then raise exception 'Environnement invalide'; end if;
  insert into public.tafa_payout_provider_health(provider,enabled,environment,last_checked_at,last_status,last_error,updated_at)
  values(lower(p_provider),p_enabled,lower(p_environment),now(),left(p_status,120),left(p_error,500),now())
  on conflict(provider) do update set enabled=excluded.enabled,environment=excluded.environment,last_checked_at=excluded.last_checked_at,last_status=excluded.last_status,last_error=excluded.last_error,updated_at=now();
  return true;
end $$;
revoke all on function public.tafa_set_payout_provider_health(text,boolean,text,text,text) from public;
grant execute on function public.tafa_set_payout_provider_health(text,boolean,text,text,text) to authenticated;

-- Provider-specific prefixes used only for early input validation.
-- Actual routing/authentication remains the responsibility of the official provider API.
create or replace function public.tafa_validate_mobile_money_destination(
  p_provider text,
  p_phone text
) returns boolean
language plpgsql immutable as $$
declare v text := regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g');
begin
  if left(v,4)='+261' then v='0'||substr(v,5);
  elsif left(v,3)='261' then v='0'||substr(v,4); end if;
  if v !~ '^0[0-9]{9}$' then return false; end if;
  return case lower(p_provider)
    when 'mvola' then left(v,3) in ('034','038')
    when 'orange_money' then left(v,3) in ('032','037')
    when 'airtel_money' then left(v,3) in ('033')
    else false end;
end $$;
revoke all on function public.tafa_validate_mobile_money_destination(text,text) from public;
grant execute on function public.tafa_validate_mobile_money_destination(text,text) to authenticated,service_role;

-- Keep payout provider health changes realtime for admin dashboard.
alter table public.tafa_payout_provider_health replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.tafa_payout_provider_health;
exception when duplicate_object then null; end $$;
