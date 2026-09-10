/* =========================================================
   TAFAß V68 — PAPI PAYMENTS / COINS
   Intégration Papi côté serveur uniquement.
   Aucun API key n'est stocké dans la base ou le frontend.
   ========================================================= */

create extension if not exists pgcrypto;

create table if not exists public.tafab_papi_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reference text not null unique,
  amount_mga bigint not null check (amount_mga >= 300),
  coins bigint not null check (coins > 0),
  provider text check (provider is null or provider in ('MVOLA','AIRTEL_MONEY','ORANGE_MONEY','BRED')),
  payment_method text,
  payment_status text not null default 'PENDING' check (payment_status in ('PENDING','SUCCESS','FAILED')),
  payment_link text,
  notification_token text,
  merchant_payment_reference text,
  fee_mga bigint not null default 0,
  message text,
  is_test_mode boolean not null default false,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists tafab_papi_payments_user_created_idx
  on public.tafab_papi_payments(user_id, created_at desc);
create index if not exists tafab_papi_payments_status_idx
  on public.tafab_papi_payments(payment_status, created_at desc);

alter table public.tafab_papi_payments enable row level security;
drop policy if exists tafab_papi_payments_select on public.tafab_papi_payments;
create policy tafab_papi_payments_select
  on public.tafab_papi_payments for select to authenticated
  using(user_id=auth.uid());
drop policy if exists tafab_papi_payments_insert on public.tafab_papi_payments;
drop policy if exists tafab_papi_payments_update on public.tafab_papi_payments;
drop policy if exists tafab_papi_payments_delete on public.tafab_papi_payments;

/* Application serveur : une notification Papi authentique crédite une seule fois les coins. */
create or replace function public.tafab_apply_papi_coin_payment(
  p_reference text,
  p_notification_token text,
  p_payment_status text,
  p_payment_method text default null,
  p_amount_mga bigint default 0,
  p_fee_mga bigint default 0,
  p_merchant_payment_reference text default null,
  p_message text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v public.tafab_papi_payments%rowtype;
  v_status text := upper(coalesce(p_payment_status,''));
  v_wallet public.tafab_wallets%rowtype;
begin
  if coalesce(p_reference,'')='' or coalesce(p_notification_token,'')='' then
    raise exception 'Notification Papi invalide';
  end if;

  select * into v
    from public.tafab_papi_payments
   where reference=p_reference
     and notification_token=p_notification_token
   for update;

  if v.id is null then
    raise exception 'Référence ou notificationToken Papi invalide';
  end if;

  if coalesce(p_amount_mga,0) <> v.amount_mga then
    raise exception 'Montant Papi inattendu';
  end if;

  if v.payment_status='SUCCESS' then
    return jsonb_build_object('ok',true,'already_processed',true,'reference',v.reference,'coins',v.coins);
  end if;

  if v_status not in ('SUCCESS','FAILED','PENDING') then
    raise exception 'Statut Papi invalide';
  end if;

  update public.tafab_papi_payments
     set payment_status=v_status,
         payment_method=coalesce(nullif(p_payment_method,''),payment_method),
         fee_mga=greatest(0,coalesce(p_fee_mga,0)),
         merchant_payment_reference=coalesce(nullif(p_merchant_payment_reference,''),merchant_payment_reference),
         message=coalesce(nullif(p_message,''),message),
         updated_at=now(),
         paid_at=case when v_status='SUCCESS' then now() else paid_at end
   where id=v.id;

  if v_status='SUCCESS' then
    insert into public.tafab_wallets(user_id,coins,earnings_mga,pending_earnings_mga,lifetime_earnings_mga,total_withdrawn_mga)
    values(v.user_id,0,0,0,0,0)
    on conflict(user_id) do nothing;

    select * into v_wallet from public.tafab_wallets where user_id=v.user_id for update;

    update public.tafab_wallets
       set coins=coalesce(coins,0)+v.coins,
           updated_at=now()
     where user_id=v.user_id;

    insert into public.tafab_coin_ledger(user_id,amount,kind,reference_id,note)
    values(v.user_id,v.coins,'purchase',v.id,format('Achat de %s coins via Papi · %s MGA',v.coins,v.amount_mga))
    on conflict do nothing;

    insert into public.notifications(user_id,type,title,message,entity_type,entity_id,created_at)
    values(v.user_id,'papi_payment','Paiement confirmé',format('%s coins ont été ajoutés à votre portefeuille.',v.coins),'papi_payment',v.id,now());
  elsif v_status='FAILED' then
    insert into public.notifications(user_id,type,title,message,entity_type,entity_id,created_at)
    values(v.user_id,'papi_payment','Paiement échoué',format('Le paiement Papi %s a échoué. Aucun coin n''a été ajouté.',v.amount_mga),'papi_payment',v.id,now());
  end if;

  return jsonb_build_object('ok',true,'already_processed',false,'reference',v.reference,'status',v_status,'coins',case when v_status='SUCCESS' then v.coins else 0 end);
end
$$;

revoke all on function public.tafab_apply_papi_coin_payment(text,text,text,text,bigint,bigint,text,text) from public;
grant execute on function public.tafab_apply_papi_coin_payment(text,text,text,text,bigint,bigint,text,text) to service_role;

do $$ begin
  begin alter publication supabase_realtime add table public.tafab_papi_payments; exception when duplicate_object then null; end;
end $$;

select 'TAFAß V68 — PAPI PAYMENTS READY' as status;
