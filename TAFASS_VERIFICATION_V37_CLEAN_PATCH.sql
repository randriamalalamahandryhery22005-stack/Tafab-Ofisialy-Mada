/* TAFAß V37 — Verification clean production patch
   Additive only. Uses the existing production tables payment_transactions
   and tafa_verification_requests. Does not create legacy badge_requests/payments. */

create extension if not exists pgcrypto;

alter table public.tafa_verification_requests
  add column if not exists category text,
  add column if not exists identity_name text,
  add column if not exists proof_path text,
  add column if not exists payment_method text;

-- One active verification request per account.
create unique index if not exists tafa_verification_one_pending_idx
  on public.tafa_verification_requests(user_id)
  where status='pending';

-- Private bucket for identity documents. Existing bucket is preserved.
insert into storage.buckets(id,name,public)
values ('badge-proofs','badge-proofs',false)
on conflict (id) do update set public=false;

-- Members can upload/read/delete only inside their own UUID folder.
drop policy if exists tafa_badge_proofs_insert on storage.objects;
create policy tafa_badge_proofs_insert on storage.objects
for insert to authenticated
with check (bucket_id='badge-proofs' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists tafa_badge_proofs_select on storage.objects;
create policy tafa_badge_proofs_select on storage.objects
for select to authenticated
using (bucket_id='badge-proofs' and ((storage.foldername(name))[1]=auth.uid()::text or public.tafa_is_admin(auth.uid())));

drop policy if exists tafa_badge_proofs_delete on storage.objects;
create policy tafa_badge_proofs_delete on storage.objects
for delete to authenticated
using (bucket_id='badge-proofs' and ((storage.foldername(name))[1]=auth.uid()::text or public.tafa_is_admin(auth.uid())));

-- Create the payment and verification request together.
create or replace function public.tafa_create_badge_request(
  p_category text,
  p_identity_name text,
  p_proof_path text,
  p_payment_method text,
  p_payment_reference text
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  uid uuid := auth.uid();
  rid uuid;
  pay_id uuid;
  clean_method text := trim(coalesce(p_payment_method,''));
  clean_ref text := trim(coalesce(p_payment_reference,''));
  clean_identity text := trim(coalesce(p_identity_name,''));
  clean_category text := trim(coalesce(p_category,'Autre'));
begin
  if uid is null then raise exception 'Connexion requise.'; end if;
  if public.tafa_is_admin(uid) then raise exception 'Le compte administrateur possède automatiquement le badge rouge.'; end if;
  if coalesce((select account_status from public.profiles where id=uid),'active') <> 'active' then
    raise exception 'Compte non éligible tant qu’il est restreint ou bloqué.';
  end if;
  if clean_identity='' then raise exception 'Nom légal requis.'; end if;
  if clean_ref='' then raise exception 'Référence de paiement requise.'; end if;
  if clean_method not in ('Yas Money','Airtel Money') then raise exception 'Méthode de paiement non prise en charge.'; end if;
  if exists(select 1 from public.tafa_verification_requests where user_id=uid and status='pending') then
    raise exception 'Une demande de vérification est déjà en attente.';
  end if;

  insert into public.payment_transactions(user_id,method,amount,currency,status,external_reference)
  values(uid,clean_method,25000,'MGA','pending',clean_ref)
  returning id into pay_id;

  insert into public.tafa_verification_requests(
    user_id,fee_mga,payment_reference,reason,status,category,identity_name,proof_path,payment_method
  ) values(
    uid,25000,clean_ref,clean_identity,'pending',clean_category,clean_identity,nullif(trim(coalesce(p_proof_path,'')),''),clean_method
  ) returning id into rid;

  return rid;
exception
  when unique_violation then
    raise exception 'Une demande ou un paiement de vérification est déjà en attente.';
end $$;

grant execute on function public.tafa_create_badge_request(text,text,text,text,text) to authenticated;

-- Admin list uses the production verification table and exposes payment state.
drop function if exists public.tafa_admin_list_verification_requests(integer);
create or replace function public.tafa_admin_list_verification_requests(p_limit integer default 50)
returns table(
  id uuid,user_id uuid,display_name text,email text,fee_mga bigint,payment_reference text,
  reason text,status text,created_at timestamptz,category text,identity_name text,
  proof_path text,payment_method text,payment_status text
)
language sql stable security definer set search_path=public
as $$
  select v.id,v.user_id,
    coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.username,'Compte'),
    p.email,v.fee_mga,v.payment_reference,v.reason,v.status,v.created_at,
    v.category,v.identity_name,v.proof_path,v.payment_method,pt.status
  from public.tafa_verification_requests v
  left join public.profiles p on p.id=v.user_id
  left join lateral (
    select status from public.payment_transactions x
    where x.user_id=v.user_id and x.external_reference=v.payment_reference and x.amount>=v.fee_mga
    order by x.created_at desc limit 1
  ) pt on true
  where public.tafa_is_admin(auth.uid())
  order by v.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),200));
$$;
grant execute on function public.tafa_admin_list_verification_requests(integer) to authenticated;

-- Approval is allowed only after the corresponding payment is marked paid.
create or replace function public.tafa_admin_set_verification_status(p_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path=public as $$
declare
  uid uuid;
  pref text;
  paid_ok boolean;
begin
  if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
  if p_status not in ('approved','rejected') then raise exception 'Statut invalide'; end if;
  select user_id,payment_reference into uid,pref
  from public.tafa_verification_requests where id=p_id for update;
  if uid is null then raise exception 'Demande introuvable'; end if;

  if p_status='approved' then
    select exists(
      select 1 from public.payment_transactions
      where user_id=uid and external_reference=pref and amount>=25000 and currency='MGA' and status='paid'
    ) into paid_ok;
    if not paid_ok then
      raise exception 'Paiement non vérifié. Marquez d’abord la transaction correspondante comme payée.';
    end if;
    update public.profiles set is_verified=true where id=uid;
  end if;

  update public.tafa_verification_requests
  set status=p_status,processed_at=now(),processed_by=auth.uid()
  where id=p_id;
  return true;
end $$;
grant execute on function public.tafa_admin_set_verification_status(uuid,text) to authenticated;
