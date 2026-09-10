/* TAFAß V67.2 — RETRAITS RÉELS : MVola / Orange Money / Airtel Money / Banque
   Additif idempotent. Aucun Yas Money pour les retraits créateurs. */

alter table public.tafab_creator_payout_methods
  alter column phone drop not null;

alter table public.tafab_creator_payout_methods
  add column if not exists bank_name text,
  add column if not exists bank_account text;

do $$
begin
  begin
    alter table public.tafab_creator_payout_methods drop constraint tafab_creator_payout_methods_provider_check;
  exception when undefined_object then null;
  end;
end $$;

alter table public.tafab_creator_payout_methods
  add constraint tafab_creator_payout_methods_provider_check
  check (provider in ('mvola','orange_money','airtel_money','bank'));

alter table public.tafab_withdrawal_requests
  add column if not exists provider_transaction_id text,
  add column if not exists processing_error text,
  add column if not exists processing_attempts integer not null default 0;

create or replace function public.tafab_save_payout_method_v3(
  p_provider text,
  p_phone text,
  p_account_name text,
  p_is_default boolean default false,
  p_bank_name text default '',
  p_bank_account text default ''
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_phone text;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if p_provider not in ('mvola','orange_money','airtel_money','bank') then raise exception 'Moyen de retrait invalide'; end if;
  v_phone := regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g');
  if p_provider <> 'bank' and length(regexp_replace(v_phone,'[^0-9]','','g')) < 9 then raise exception 'Numéro Mobile Money invalide'; end if;
  if p_provider='bank' and (length(trim(coalesce(p_bank_name,'')))<2 or length(trim(coalesce(p_bank_account,'')))<4) then raise exception 'Informations bancaires incomplètes'; end if;
  if length(trim(coalesce(p_account_name,'')))<2 then raise exception 'Nom du titulaire requis'; end if;
  if p_is_default then
    update public.tafab_creator_payout_methods set is_default=false,updated_at=now() where user_id=auth.uid();
  end if;
  insert into public.tafab_creator_payout_methods(user_id,provider,phone,account_name,is_default,status,bank_name,bank_account)
  values(auth.uid(),p_provider,case when p_provider='bank' then null else left(v_phone,30) end,left(trim(p_account_name),120),p_is_default,'active',left(trim(coalesce(p_bank_name,'')),120),left(trim(coalesce(p_bank_account,'')),80))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.tafab_save_payout_method_v3(text,text,text,boolean,text,text) from public;
grant execute on function public.tafab_save_payout_method_v3(text,text,text,boolean,text,text) to authenticated;

create or replace function public.tafab_request_creator_withdrawal(p_amount_mga numeric,p_payout_method_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_wallet public.tafab_wallets%rowtype; v_min numeric; v_provider text; v_phone text; v_bank text; v_account text; v_id uuid; v_hint text;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if coalesce(p_amount_mga,0)<=0 then raise exception 'Montant invalide'; end if;
  select min_withdrawal_mga into v_min from public.tafab_creator_monetization where user_id=auth.uid() and status='approved' and enabled=true;
  if v_min is null then raise exception 'Monétisation non activée'; end if;
  if p_amount_mga<v_min then raise exception 'Montant minimum : % Ar',v_min; end if;
  select provider,phone,bank_name,bank_account into v_provider,v_phone,v_bank,v_account
    from public.tafab_creator_payout_methods where id=p_payout_method_id and user_id=auth.uid() and status='active';
  if v_provider is null then raise exception 'Moyen de retrait introuvable'; end if;
  if v_provider='bank' then v_hint := format('%s · compte %s',v_bank, right(regexp_replace(coalesce(v_account,''),'[^0-9A-Za-z]','','g'),4)); else v_hint := format('%s · %s',v_provider,v_phone); end if;
  select * into v_wallet from public.tafab_wallets where user_id=auth.uid() for update;
  if v_wallet.user_id is null or coalesce(v_wallet.earnings_mga,0)<p_amount_mga then raise exception 'Solde disponible insuffisant'; end if;
  update public.tafab_wallets set earnings_mga=earnings_mga-p_amount_mga,pending_earnings_mga=coalesce(pending_earnings_mga,0)+p_amount_mga,updated_at=now() where user_id=auth.uid();
  insert into public.tafab_withdrawal_requests(user_id,amount_mga,method,destination_hint,status,payout_method_id,processing_attempts)
  values(auth.uid(),round(p_amount_mga,2),v_provider,v_hint,'pending',p_payout_method_id,0) returning id into v_id;
  insert into public.notifications(user_id,type,title,message,entity_type,entity_id,created_at)
  values(auth.uid(),'creator_withdrawal','Demande de retrait reçue',format('Votre demande de %s Ar vers %s est enregistrée et sera traitée par le service de paiement.',round(p_amount_mga,2),v_hint),'creator_withdrawal',v_id,now());
  return v_id;
end $$;
revoke all on function public.tafab_request_creator_withdrawal(numeric,uuid) from public;
grant execute on function public.tafab_request_creator_withdrawal(numeric,uuid) to authenticated;

select 'V67.2 REAL PAYOUT METHODS READY' as status;
