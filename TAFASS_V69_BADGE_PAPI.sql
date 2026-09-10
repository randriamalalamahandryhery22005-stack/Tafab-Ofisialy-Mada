/* =========================================================
   TAFAß V69 — BADGE BLEU + PAPI REAL PAYMENT
   - 25 000 MGA via Papi
   - MVola / Orange Money / Airtel Money
   - No manual transaction reference
   - Badge is never approved before Papi SUCCESS
   - Admin can only approve after server confirmation
   ========================================================= */

create extension if not exists pgcrypto;

alter table public.tafa_verification_requests
  add column if not exists payment_status text not null default 'PENDING';
alter table public.tafa_verification_requests
  add column if not exists papi_notification_token text;
alter table public.tafa_verification_requests
  add column if not exists papi_payment_link text;
alter table public.tafa_verification_requests
  add column if not exists papi_merchant_payment_reference text;
alter table public.tafa_verification_requests
  add column if not exists paid_at timestamptz;

-- Keep existing payment_reference as the Papi payment reference.
create unique index if not exists tafa_verification_papi_reference_uq
  on public.tafa_verification_requests(payment_reference)
  where payment_reference is not null and btrim(payment_reference) <> '';

create index if not exists tafa_verification_payment_status_idx
  on public.tafa_verification_requests(payment_status,created_at desc);

/* Replace the old manual-reference badge creation RPC. */
drop function if exists public.tafa_create_badge_request(text,text,text,text,text);
create or replace function public.tafa_create_badge_request(
  p_category text,
  p_identity_name text,
  p_proof_path text,
  p_payment_method text,
  p_payment_reference text default ''
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid();
  rid uuid;
  identity text:=left(trim(coalesce(p_identity_name,'')),160);
  category text:=left(trim(coalesce(p_category,'Autre')),120);
  method text:=upper(trim(coalesce(p_payment_method,'MVOLA')));
begin
  if uid is null then raise exception 'Connexion requise.'; end if;
  if public.tafa_is_admin(uid) then raise exception 'Le compte administrateur possède automatiquement le badge rouge.'; end if;
  if coalesce((select account_status from public.profiles where id=uid),'active')<>'active' then
    raise exception 'Compte non éligible tant qu’il est restreint ou bloqué.';
  end if;
  if identity='' then raise exception 'Nom légal requis.'; end if;
  if category='' then raise exception 'Catégorie requise.'; end if;
  if method not in ('MVOLA','ORANGE_MONEY','AIRTEL_MONEY') then raise exception 'Méthode Papi non prise en charge.'; end if;
  if nullif(trim(coalesce(p_proof_path,'')),'') is null then raise exception 'Le justificatif est obligatoire.'; end if;
  if exists(select 1 from public.tafa_verification_requests where user_id=uid and status='pending') then
    raise exception 'Une demande de vérification est déjà en attente.';
  end if;

  insert into public.tafa_verification_requests(
    user_id,fee_mga,payment_reference,reason,status,category,identity_name,proof_path,payment_method,payment_status
  ) values(
    uid,25000,null,identity,'pending',category,identity,nullif(trim(p_proof_path),''),method,'PENDING'
  ) returning id into rid;

  return rid;
exception when unique_violation then
  raise exception 'Une demande de vérification est déjà en attente.';
end $$;
grant execute on function public.tafa_create_badge_request(text,text,text,text,text) to authenticated;

/* Server-side Papi notification application for badge payments. */
create or replace function public.tafa_apply_papi_badge_payment(
  p_reference text,
  p_notification_token text,
  p_payment_status text,
  p_payment_method text default null,
  p_amount_mga bigint default 0,
  p_merchant_payment_reference text default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v public.tafa_verification_requests%rowtype;
  v_status text:=upper(coalesce(p_payment_status,''));
  v_method text:=upper(trim(coalesce(p_payment_method,'')));
begin
  if coalesce(p_reference,'')='' or coalesce(p_notification_token,'')='' then
    raise exception 'Notification Papi invalide.';
  end if;

  select * into v
  from public.tafa_verification_requests
  where payment_reference=p_reference
    and papi_notification_token=p_notification_token
  for update;

  if v.id is null then raise exception 'Référence ou notificationToken Papi invalide.'; end if;
  if coalesce(v.fee_mga,25000)<>coalesce(p_amount_mga,0) then raise exception 'Montant du badge inattendu.'; end if;
  if v.payment_status='SUCCESS' then
    return jsonb_build_object('ok',true,'already_processed',true,'request_id',v.id,'status','SUCCESS');
  end if;
  if v_status not in ('SUCCESS','FAILED','PENDING') then raise exception 'Statut Papi invalide.'; end if;
  if v_method<>'' and v_method not in ('MVOLA','ORANGE_MONEY','AIRTEL_MONEY','BRED') then raise exception 'Méthode Papi invalide.'; end if;

  update public.tafa_verification_requests
     set payment_status=v_status,
         payment_method=coalesce(nullif(v_method,''),payment_method),
         papi_merchant_payment_reference=coalesce(nullif(trim(coalesce(p_merchant_payment_reference,'')),''),papi_merchant_payment_reference),
         paid_at=case when v_status='SUCCESS' then now() else paid_at end
   where id=v.id;

  if v_status='SUCCESS' then
    insert into public.notifications(user_id,type,title,message,entity_type,entity_id,created_at)
    values(v.user_id,'badge_payment','Paiement du badge confirmé',
      'Votre paiement Papi de 25 000 Ar est confirmé. Votre dossier peut maintenant être examiné par l’administration.',
      'tafa_verification_request',v.id,now());
  elsif v_status='FAILED' then
    insert into public.notifications(user_id,type,title,message,entity_type,entity_id,created_at)
    values(v.user_id,'badge_payment','Paiement du badge échoué',
      'Le paiement Papi n’a pas été confirmé. Vous pouvez relancer le paiement depuis la page Badge officiel.',
      'tafa_verification_request',v.id,now());
  end if;

  return jsonb_build_object('ok',true,'already_processed',false,'request_id',v.id,'status',v_status);
end $$;
revoke all on function public.tafa_apply_papi_badge_payment(text,text,text,text,bigint,text) from public;
grant execute on function public.tafa_apply_papi_badge_payment(text,text,text,text,bigint,text) to service_role;

/* Admin list now exposes the Papi payment state. */
drop function if exists public.tafa_admin_list_badge_requests(integer);
create or replace function public.tafa_admin_list_badge_requests(p_limit integer default 50)
returns table(
  id uuid,user_id uuid,display_name text,email text,fee_mga bigint,payment_reference text,reason text,status text,created_at timestamptz,
  category text,identity_name text,proof_path text,payment_method text,payment_status text,paid_at timestamptz,papi_merchant_payment_reference text
)
language sql stable security definer set search_path=public as $$
  select v.id,v.user_id,
    coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.username,'Compte'),
    p.email,v.fee_mga,v.payment_reference,v.reason,v.status,v.created_at,v.category,v.identity_name,v.proof_path,v.payment_method,
    v.payment_status,v.paid_at,v.papi_merchant_payment_reference
  from public.tafa_verification_requests v
  left join public.profiles p on p.id=v.user_id
  where exists(select 1 from public.profiles me where me.id=auth.uid() and (me.is_admin=true or me.admin_badge=true))
  order by v.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),200));
$$;
grant execute on function public.tafa_admin_list_badge_requests(integer) to authenticated;

/* Admin can reject anytime, but can approve ONLY after Papi SUCCESS. */
create or replace function public.tafa_admin_set_verification_status(p_id uuid,p_status text)
returns boolean
language plpgsql security definer set search_path=public as $$
declare uid uuid; ps text; current_status text;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and (is_admin=true or admin_badge=true)) then
    raise exception 'Accès administrateur requis';
  end if;
  if p_status not in ('approved','rejected') then raise exception 'Statut invalide'; end if;
  select user_id,status,payment_status into uid,current_status,ps from public.tafa_verification_requests where id=p_id for update;
  if uid is null then raise exception 'Demande introuvable'; end if;
  if current_status<>'pending' then raise exception 'Cette demande a déjà été traitée.'; end if;
  if p_status='approved' and coalesce(ps,'PENDING')<>'SUCCESS' then
    raise exception 'Paiement Papi non confirmé. Impossible d’activer le badge.';
  end if;
  if p_status='approved' then update public.profiles set is_verified=true where id=uid; end if;
  if p_status='rejected' then update public.profiles set is_verified=false where id=uid; end if;
  update public.tafa_verification_requests set status=p_status,processed_at=now(),processed_by=auth.uid() where id=p_id;
  return true;
end $$;
grant execute on function public.tafa_admin_set_verification_status(uuid,text) to authenticated;

/* Backward-compatible admin RPC. */
create or replace function public.tafa_admin_review_badge(p_request_id uuid,p_status text)
returns boolean language sql security definer set search_path=public as $$
  select public.tafa_admin_set_verification_status(p_request_id,p_status);
$$;
grant execute on function public.tafa_admin_review_badge(uuid,text) to authenticated;

alter table public.tafa_verification_requests replica identity full;
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tafa_verification_requests') then
    alter publication supabase_realtime add table public.tafa_verification_requests;
  end if;
exception when undefined_object then null; end $$;

notify pgrst,'reload schema';
select 'TAFAß V69 — BADGE PAPI READY' as status;
