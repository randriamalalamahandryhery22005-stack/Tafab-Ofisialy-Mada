/* ============================================================
   TAFAß V67.3 — REAL PAYOUTS
   MVola / Orange Money / Airtel Money / Banque
   - Supprime Yas des moyens créateur.
   - Ajoute les coordonnées bancaires.
   - Le solde n'est finalisé qu'après confirmation du service de paiement.
   ============================================================ */

alter table public.tafab_creator_payout_methods drop constraint if exists tafab_creator_payout_methods_provider_check;
alter table public.tafab_creator_payout_methods add constraint tafab_creator_payout_methods_provider_check
  check (provider in ('mvola','orange_money','airtel_money','bank'));
alter table public.tafab_creator_payout_methods add column if not exists bank_name text;
alter table public.tafab_creator_payout_methods add column if not exists bank_account text;

alter table public.tafab_withdrawal_requests add column if not exists provider_reference text;
alter table public.tafab_withdrawal_requests add column if not exists payout_attempts integer not null default 0;
alter table public.tafab_withdrawal_requests add column if not exists last_payout_error text;
create unique index if not exists tafab_withdrawal_provider_reference_uq on public.tafab_withdrawal_requests(provider_reference) where provider_reference is not null;

create or replace function public.tafab_save_payout_method_v67_3(
  p_provider text,
  p_phone text default '',
  p_account_name text default '',
  p_bank_name text default '',
  p_bank_account text default '',
  p_is_default boolean default false
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if p_provider not in ('mvola','orange_money','airtel_money','bank') then raise exception 'Moyen de paiement invalide'; end if;
  if p_provider='bank' then
    if length(trim(coalesce(p_bank_name,''))) < 2 or length(regexp_replace(coalesce(p_bank_account,''),'\\s','','g')) < 6 or length(trim(coalesce(p_account_name,''))) < 2 then
      raise exception 'Informations bancaires incomplètes';
    end if;
  elsif length(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')) < 9 then
    raise exception 'Numéro Mobile Money invalide';
  end if;
  if p_is_default then update public.tafab_creator_payout_methods set is_default=false,updated_at=now() where user_id=auth.uid(); end if;
  insert into public.tafab_creator_payout_methods(user_id,provider,phone,account_name,bank_name,bank_account,is_default,status)
  values(auth.uid(),p_provider,left(trim(coalesce(p_phone,'')),30),left(trim(coalesce(p_account_name,'')),120),left(trim(coalesce(p_bank_name,'')),120),left(trim(coalesce(p_bank_account,'')),80),p_is_default,'active')
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.tafab_save_payout_method_v67_3(text,text,text,text,text,boolean) from public;
grant execute on function public.tafab_save_payout_method_v67_3(text,text,text,text,text,boolean) to authenticated;

/* Finalisation réservée au service de paiement ou à un administrateur.
   'paid' ne doit jamais être appelé avant une confirmation externe. */
create or replace function public.tafa_finalize_creator_payout(
  p_request_id uuid,
  p_external_reference text,
  p_provider_status text default 'success'
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v public.tafab_withdrawal_requests%rowtype;
  v_is_service boolean := coalesce(current_setting('request.jwt.claim.role', true),'')='service_role';
begin
  if not v_is_service and not public.tafa_is_admin(auth.uid()) then raise exception 'Accès paiement requis'; end if;
  select * into v from public.tafab_withdrawal_requests where id=p_request_id for update;
  if v.id is null then raise exception 'Retrait introuvable'; end if;
  if v.status not in ('pending','approved') then raise exception 'Retrait déjà traité'; end if;
  if lower(coalesce(p_provider_status,'')) not in ('success','succeeded','paid','completed') then raise exception 'Paiement externe non confirmé'; end if;
  if nullif(trim(coalesce(p_external_reference,'')),'') is null then raise exception 'Référence externe obligatoire'; end if;
  update public.tafab_withdrawal_requests
     set status='paid', processed_at=now(), provider_reference=left(trim(p_external_reference),180), last_payout_error=null
   where id=v.id;
  update public.tafab_wallets
     set pending_earnings_mga=greatest(0,coalesce(pending_earnings_mga,0)-v.amount_mga),
         total_withdrawn_mga=coalesce(total_withdrawn_mga,0)+v.amount_mga,
         updated_at=now()
   where user_id=v.user_id;
  return true;
end $$;
revoke all on function public.tafa_finalize_creator_payout(uuid,text,text) from public;
grant execute on function public.tafa_finalize_creator_payout(uuid,text,text) to service_role, authenticated;

/* Rejet : restitution atomique */
create or replace function public.tafa_reject_creator_payout_v67_3(p_request_id uuid,p_admin_note text default '')
returns boolean language plpgsql security definer set search_path=public as $$
declare v public.tafab_withdrawal_requests%rowtype;
begin
  if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
  select * into v from public.tafab_withdrawal_requests where id=p_request_id for update;
  if v.id is null or v.status not in ('pending','approved') then raise exception 'Retrait introuvable ou déjà traité'; end if;
  update public.tafab_withdrawal_requests set status='rejected',processed_at=now(),admin_note=left(coalesce(p_admin_note,''),500) where id=v.id;
  update public.tafab_wallets set pending_earnings_mga=greatest(0,coalesce(pending_earnings_mga,0)-v.amount_mga),earnings_mga=coalesce(earnings_mga,0)+v.amount_mga,updated_at=now() where user_id=v.user_id;
  return true;
end $$;
revoke all on function public.tafa_reject_creator_payout_v67_3(uuid,text) from public;
grant execute on function public.tafa_reject_creator_payout_v67_3(uuid,text) to authenticated;

notify pgrst,'reload schema';


/* L'ancien bouton admin 'paid' ne doit plus finaliser sans API. */
create or replace function public.tafa_admin_process_creator_payout(p_request_id uuid,p_status text,p_admin_note text default '')
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
  if p_status='paid' then raise exception 'Utilisez le service tafa-payout pour effectuer le paiement réel.'; end if;
  if p_status<>'rejected' then raise exception 'Statut invalide'; end if;
  return public.tafa_reject_creator_payout_v67_3(p_request_id,p_admin_note);
end $$;
revoke all on function public.tafa_admin_process_creator_payout(uuid,text,text) from public;
grant execute on function public.tafa_admin_process_creator_payout(uuid,text,text) to authenticated;
