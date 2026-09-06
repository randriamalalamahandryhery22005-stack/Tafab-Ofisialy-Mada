/* =========================================================
   TAFAß MONÉTISATION V2 — COINS → REVENUS → RETRAITS RÉELS
   Migration additive et idempotente. Aucun contenu utilisateur n'est supprimé.
   ========================================================= */

alter table public.tafab_creator_monetization
  add column if not exists coins_to_mga numeric(14,4) not null default 10;

update public.tafab_creator_monetization
   set coins_to_mga=10
 where coins_to_mga is null or coins_to_mga<=0;

/* Conversion officielle : 10 coins de valeur brute = 1 Ar brut.
   La part créateur est ensuite appliquée par tafab_record_creator_earning(). */

create or replace function public.tafab_credit_live_gift_earning()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_coin_value numeric := 10;
  v_gross numeric;
begin
  if new.receiver_id is null or new.sender_id is null or new.receiver_id=new.sender_id then
    return new;
  end if;
  select coalesce(coins_to_mga,10) into v_coin_value
    from public.tafab_creator_monetization
   where user_id=new.receiver_id and status='approved' and enabled=true;
  v_coin_value := greatest(1,v_coin_value);
  v_gross := round(greatest(0,coalesce(new.coins,0)) / v_coin_value,2);
  if v_gross > 0 then
    perform public.tafab_record_creator_earning(
      new.receiver_id,
      'live_gift',
      new.id,
      v_gross,
      format('Cadeau Live · %s coins',new.coins)
    );
  end if;
  return new;
end
$$;

drop trigger if exists tafab_credit_live_gift_earning on public.tafab_live_gifts;
create trigger tafab_credit_live_gift_earning
after insert on public.tafab_live_gifts
for each row execute function public.tafab_credit_live_gift_earning();

/* Remplace l'ancien transfert qui créditait directement le créateur.
   Le créateur reçoit maintenant un revenu MGA via le ledger, sans double crédit.
   Les coins du créateur ne sont plus gonflés artificiellement par un cadeau reçu. */
create or replace function public.tafab_send_live_gift(
  p_live_session_id uuid,
  p_receiver_id uuid,
  p_gift_type text,
  p_coins bigint
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  sender_balance bigint;
  session_owner uuid;
  gift_id uuid;
begin
  if uid is null then raise exception 'Connexion requise'; end if;
  if p_coins is null or p_coins <= 0 or p_coins > 100000 then raise exception 'Montant de coins invalide'; end if;
  select user_id into session_owner from public.live_sessions where id=p_live_session_id and status='live';
  if session_owner is null then raise exception 'Direct indisponible'; end if;
  if session_owner=uid then raise exception 'Vous ne pouvez pas vous envoyer un cadeau'; end if;
  if p_receiver_id<>session_owner then raise exception 'Destinataire invalide'; end if;

  insert into public.tafab_wallets(user_id,coins,earnings_mga,pending_earnings_mga,lifetime_earnings_mga,total_withdrawn_mga)
  values(uid,0,0,0,0,0) on conflict(user_id) do nothing;

  select coins into sender_balance from public.tafab_wallets where user_id=uid for update;
  if coalesce(sender_balance,0)<p_coins then raise exception 'Coins insuffisants'; end if;

  update public.tafab_wallets
     set coins=coins-p_coins,updated_at=now()
   where user_id=uid;

  insert into public.tafab_coin_ledger(user_id,amount,kind,note)
  values(uid,-p_coins,'gift_sent',coalesce(nullif(p_gift_type,''),'heart'));

  insert into public.tafab_live_gifts(live_session_id,sender_id,receiver_id,gift_type,coins)
  values(p_live_session_id,uid,session_owner,coalesce(nullif(p_gift_type,''),'heart'),p_coins)
  returning id into gift_id;

  insert into public.tafab_coin_ledger(user_id,amount,kind,reference_id,note)
  values(session_owner,p_coins,'gift_received',gift_id,coalesce(nullif(p_gift_type,''),'heart'));

  return jsonb_build_object(
    'ok',true,
    'gift_id',gift_id,
    'remaining_coins',sender_balance-p_coins,
    'gross_mga',round(p_coins/greatest(1,coalesce((select coins_to_mga from public.tafab_creator_monetization where user_id=session_owner),10)),2)
  );
end
$$;
revoke all on function public.tafab_send_live_gift(uuid,uuid,text,bigint) from public;
grant execute on function public.tafab_send_live_gift(uuid,uuid,text,bigint) to authenticated;

/* Le paiement final d'un retrait doit utiliser le statut métier 'paid'. */
create or replace function public.tafa_admin_process_creator_payout(
  p_request_id uuid,
  p_status text,
  p_admin_note text default ''
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v public.tafab_withdrawal_requests%rowtype;
begin
  if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
  if p_status not in ('paid','rejected') then raise exception 'Statut de paiement invalide'; end if;

  select * into v
    from public.tafab_withdrawal_requests
   where id=p_request_id and payout_method_id is not null
   for update;
  if v.id is null then raise exception 'Retrait introuvable'; end if;
  if v.status<>'pending' then raise exception 'Ce retrait a déjà été traité'; end if;

  if p_status='paid' then
    update public.tafab_withdrawal_requests
       set status='paid',processed_at=now(),admin_note=left(coalesce(p_admin_note,''),500)
     where id=v.id;
    update public.tafab_wallets
       set pending_earnings_mga=greatest(0,coalesce(pending_earnings_mga,0)-v.amount_mga),
           total_withdrawn_mga=coalesce(total_withdrawn_mga,0)+v.amount_mga,
           updated_at=now()
     where user_id=v.user_id;
  else
    update public.tafab_withdrawal_requests
       set status='rejected',processed_at=now(),admin_note=left(coalesce(p_admin_note,''),500)
     where id=v.id;
    update public.tafab_wallets
       set pending_earnings_mga=greatest(0,coalesce(pending_earnings_mga,0)-v.amount_mga),
           earnings_mga=coalesce(earnings_mga,0)+v.amount_mga,
           updated_at=now()
     where user_id=v.user_id;
  end if;

  insert into public.notifications(user_id,type,title,message,entity_type,entity_id,created_at)
  values(
    v.user_id,
    'creator_withdrawal',
    case when p_status='paid' then 'Retrait payé' else 'Retrait refusé' end,
    case when p_status='paid' then format('Votre retrait de %s Ar a été payé.',v.amount_mga)
         else format('Votre retrait de %s Ar a été refusé. Le montant a été rendu à votre solde.',v.amount_mga) end,
    'creator_withdrawal',v.id,now()
  );
  return true;
end
$$;
revoke all on function public.tafa_admin_process_creator_payout(uuid,text,text) from public;
grant execute on function public.tafa_admin_process_creator_payout(uuid,text,text) to authenticated;

/* Une demande de retrait reste atomique et ne peut pas dépasser le solde disponible. */
create or replace function public.tafab_request_creator_withdrawal(p_amount_mga numeric,p_payout_method_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_wallet public.tafab_wallets%rowtype;
  v_min numeric;
  v_provider text;
  v_phone text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if coalesce(p_amount_mga,0)<=0 then raise exception 'Montant invalide'; end if;
  select min_withdrawal_mga into v_min
    from public.tafab_creator_monetization
   where user_id=auth.uid() and status='approved' and enabled=true;
  if v_min is null then raise exception 'Monétisation non activée'; end if;
  if p_amount_mga<v_min then raise exception 'Montant minimum : % Ar',v_min; end if;
  select provider,phone into v_provider,v_phone
    from public.tafab_creator_payout_methods
   where id=p_payout_method_id and user_id=auth.uid() and status='active';
  if v_provider is null then raise exception 'Moyen de retrait introuvable'; end if;
  select * into v_wallet from public.tafab_wallets where user_id=auth.uid() for update;
  if v_wallet.user_id is null or coalesce(v_wallet.earnings_mga,0)<p_amount_mga then raise exception 'Solde disponible insuffisant'; end if;

  update public.tafab_wallets
     set earnings_mga=earnings_mga-p_amount_mga,
         pending_earnings_mga=coalesce(pending_earnings_mga,0)+p_amount_mga,
         updated_at=now()
   where user_id=auth.uid();

  insert into public.tafab_withdrawal_requests(user_id,amount_mga,method,destination_hint,status,payout_method_id)
  values(auth.uid(),round(p_amount_mga,2),'mobile_money',v_phone,'pending',p_payout_method_id)
  returning id into v_id;

  insert into public.notifications(user_id,type,title,message,entity_type,entity_id,created_at)
  values(auth.uid(),'creator_withdrawal','Demande de retrait reçue',format('Votre demande de %s Ar est en cours de vérification.',round(p_amount_mga,2)),'creator_withdrawal',v_id,now());
  return v_id;
end
$$;
revoke all on function public.tafab_request_creator_withdrawal(numeric,uuid) from public;
grant execute on function public.tafab_request_creator_withdrawal(numeric,uuid) to authenticated;

/* Realtime : solde, revenus et retraits. */
do $$ begin
  begin alter publication supabase_realtime add table public.tafab_wallets; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.tafab_withdrawal_requests; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
end $$;

select 'TAFAß MONÉTISATION V2 — COINS → MGA + RETRAITS PREMIUM READY' as status;

/* ================================================================
   BONUS DE BIENVENUE : 100 COINS POUR CHAQUE NOUVEAU COMPTE
   ================================================================
   Le crédit est effectué côté serveur à la création de auth.users.
   Il fonctionne pour l'inscription e-mail et pour un premier compte OAuth.
   ON CONFLICT évite tout doublon si le portefeuille existe déjà.
*/
create or replace function public.tafab_grant_new_account_bonus()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.tafab_wallets(user_id,coins,earnings_mga,pending_earnings_mga,lifetime_earnings_mga,total_withdrawn_mga)
  values(new.id,100,0,0,0,0)
  on conflict(user_id) do nothing;
  return new;
end
$$;

revoke all on function public.tafab_grant_new_account_bonus() from public;

drop trigger if exists tafab_new_account_bonus on auth.users;
create trigger tafab_new_account_bonus
after insert on auth.users
for each row execute function public.tafab_grant_new_account_bonus();

/* Le seuil monétaire officiel reste 1 000 Ar.
   Avec le barème 10 coins = 1 Ar brut, cela correspond à 10 000 coins bruts. */
update public.tafab_creator_monetization
   set min_withdrawal_mga=1000
 where min_withdrawal_mga is null or min_withdrawal_mga<1000;
