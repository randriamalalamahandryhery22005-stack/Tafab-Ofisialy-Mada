/* TAFAß V40 — Limits + Pages/Groups + Verification
   Additive/idempotent patch. No existing data is deleted. */

create extension if not exists pgcrypto;

/* ============================================================
   1) PAGE FOLLOW + GROUP JOIN
============================================================ */
create or replace function public.tafa_toggle_page_follow(p_page_id uuid)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  uid uuid := auth.uid();
  exists_row boolean;
  owner_id uuid;
begin
  if uid is null then return jsonb_build_object('success',false,'message','Connexion requise.'); end if;
  select owner_id into owner_id from public.pages where id=p_page_id;
  if owner_id is null then return jsonb_build_object('success',false,'message','Page introuvable.'); end if;
  if owner_id=uid then return jsonb_build_object('success',false,'message','Le propriétaire ne peut pas suivre sa propre Page.'); end if;
  select exists(select 1 from public.page_followers where page_id=p_page_id and user_id=uid) into exists_row;
  if exists_row then
    delete from public.page_followers where page_id=p_page_id and user_id=uid;
    return jsonb_build_object('success',true,'followed',false);
  end if;
  insert into public.page_followers(page_id,user_id) values(p_page_id,uid)
  on conflict(page_id,user_id) do nothing;
  return jsonb_build_object('success',true,'followed',true);
exception when others then
  return jsonb_build_object('success',false,'message',sqlerrm);
end $$;
grant execute on function public.tafa_toggle_page_follow(uuid) to authenticated;

create or replace function public.tafa_toggle_group_membership(p_group_id uuid)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  uid uuid := auth.uid();
  exists_row boolean;
  member_role text;
  owner_id uuid;
  privacy_value text;
begin
  if uid is null then return jsonb_build_object('success',false,'message','Connexion requise.'); end if;
  select owner_id,coalesce(privacy,'public') into owner_id,privacy_value from public.groups where id=p_group_id;
  if owner_id is null then return jsonb_build_object('success',false,'message','Groupe introuvable.'); end if;
  select role into member_role from public.group_members where group_id=p_group_id and user_id=uid;
  exists_row := member_role is not null;
  if exists_row then
    if owner_id=uid then return jsonb_build_object('success',false,'message','Le propriétaire ne peut pas quitter son propre groupe.'); end if;
    delete from public.group_members where group_id=p_group_id and user_id=uid;
    return jsonb_build_object('success',true,'joined',false);
  end if;
  if owner_id<>uid and lower(privacy_value) not in ('public','publique') then
    return jsonb_build_object('success',false,'message','Ce groupe est privé. Une invitation ou une validation est nécessaire.');
  end if;
  insert into public.group_members(group_id,user_id,role) values(p_group_id,uid,'member')
  on conflict(group_id,user_id) do nothing;
  return jsonb_build_object('success',true,'joined',true);
exception when others then
  return jsonb_build_object('success',false,'message',sqlerrm);
end $$;
grant execute on function public.tafa_toggle_group_membership(uuid) to authenticated;

/* ============================================================
   2) VERIFICATION / BADGE BLEU — TABLE PRODUCTION
============================================================ */
create table if not exists public.tafa_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  fee_mga bigint not null default 25000,
  payment_reference text,
  reason text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid,
  category text,
  identity_name text,
  proof_path text,
  payment_method text
);

alter table public.tafa_verification_requests add column if not exists fee_mga bigint not null default 25000;
alter table public.tafa_verification_requests add column if not exists payment_reference text;
alter table public.tafa_verification_requests add column if not exists reason text;
alter table public.tafa_verification_requests add column if not exists status text not null default 'pending';
alter table public.tafa_verification_requests add column if not exists created_at timestamptz not null default now();
alter table public.tafa_verification_requests add column if not exists processed_at timestamptz;
alter table public.tafa_verification_requests add column if not exists processed_by uuid;
alter table public.tafa_verification_requests add column if not exists category text;
alter table public.tafa_verification_requests add column if not exists identity_name text;
alter table public.tafa_verification_requests add column if not exists proof_path text;
alter table public.tafa_verification_requests add column if not exists payment_method text;

create unique index if not exists tafa_verification_one_pending_v40
on public.tafa_verification_requests(user_id) where status='pending';

alter table public.tafa_verification_requests enable row level security;
drop policy if exists tafa_verification_self_select_v40 on public.tafa_verification_requests;
create policy tafa_verification_self_select_v40 on public.tafa_verification_requests
for select to authenticated using (user_id=auth.uid());

insert into storage.buckets(id,name,public) values('badge-proofs','badge-proofs',false)
on conflict(id) do update set public=false;

drop policy if exists tafa_badge_proofs_insert_v40 on storage.objects;
create policy tafa_badge_proofs_insert_v40 on storage.objects
for insert to authenticated
with check(bucket_id='badge-proofs' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists tafa_badge_proofs_select_v40 on storage.objects;
create policy tafa_badge_proofs_select_v40 on storage.objects
for select to authenticated
using(bucket_id='badge-proofs' and ((storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from public.profiles p where p.id=auth.uid() and (p.is_admin=true or p.admin_badge=true))));

drop policy if exists tafa_badge_proofs_delete_v40 on storage.objects;
create policy tafa_badge_proofs_delete_v40 on storage.objects
for delete to authenticated
using(bucket_id='badge-proofs' and ((storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from public.profiles p where p.id=auth.uid() and (p.is_admin=true or p.admin_badge=true))));

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
  clean_category text := trim(coalesce(p_category,'Autre'));
  clean_identity text := trim(coalesce(p_identity_name,''));
  clean_method text := trim(coalesce(p_payment_method,''));
  clean_ref text := trim(coalesce(p_payment_reference,''));
begin
  if uid is null then raise exception 'Connexion requise.'; end if;
  if exists(select 1 from public.profiles where id=uid and (is_admin=true or admin_badge=true)) then raise exception 'Le compte administrateur est exempté de la vérification publique.'; end if;
  if coalesce((select account_status from public.profiles where id=uid),'active') <> 'active' then raise exception 'Compte non éligible tant qu’il est restreint ou bloqué.'; end if;
  if clean_identity='' then raise exception 'Nom légal requis.'; end if;
  if clean_ref='' then raise exception 'Référence de paiement requise.'; end if;
  if clean_method not in ('Yas Money','Airtel Money') then raise exception 'Méthode de paiement non prise en charge.'; end if;
  if exists(select 1 from public.tafa_verification_requests where user_id=uid and status='pending') then raise exception 'Une demande de vérification est déjà en attente.'; end if;

  insert into public.tafa_verification_requests(user_id,fee_mga,payment_reference,reason,status,category,identity_name,proof_path,payment_method)
  values(uid,25000,clean_ref,clean_identity,'pending',clean_category,clean_identity,nullif(trim(coalesce(p_proof_path,'')),''),clean_method)
  returning id into rid;
  return rid;
exception when unique_violation then
  raise exception 'Une demande de vérification est déjà en attente.';
end $$;
grant execute on function public.tafa_create_badge_request(text,text,text,text,text) to authenticated;

/* Compatibility RPC used by the existing admin dashboard. */
drop function if exists public.tafa_admin_list_badge_requests(integer);
create or replace function public.tafa_admin_list_badge_requests(p_limit integer default 50)
returns table(id uuid,user_id uuid,display_name text,email text,fee_mga bigint,payment_reference text,reason text,status text,created_at timestamptz,category text,identity_name text,proof_path text,payment_method text)
language sql stable security definer set search_path=public
as $$
  select v.id,v.user_id,
    coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.username,'Compte'),
    p.email,v.fee_mga,v.payment_reference,v.reason,v.status,v.created_at,v.category,v.identity_name,v.proof_path,v.payment_method
  from public.tafa_verification_requests v
  left join public.profiles p on p.id=v.user_id
  where exists(select 1 from public.profiles me where me.id=auth.uid() and (me.is_admin=true or me.admin_badge=true))
  order by v.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),200));
$$;
grant execute on function public.tafa_admin_list_badge_requests(integer) to authenticated;

create or replace function public.tafa_admin_set_verification_status(p_id uuid,p_status text)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare uid uuid;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and (is_admin=true or admin_badge=true)) then raise exception 'Accès administrateur requis'; end if;
  if p_status not in ('approved','rejected') then raise exception 'Statut invalide'; end if;
  select user_id into uid from public.tafa_verification_requests where id=p_id for update;
  if uid is null then raise exception 'Demande introuvable'; end if;
  if p_status='approved' then update public.profiles set is_verified=true where id=uid; end if;
  if p_status='rejected' then update public.profiles set is_verified=false where id=uid; end if;
  update public.tafa_verification_requests set status=p_status,processed_at=now(),processed_by=auth.uid() where id=p_id;
  return true;
end $$;
grant execute on function public.tafa_admin_set_verification_status(uuid,text) to authenticated;

/* Backward-compatible admin name retained for older clients. */
create or replace function public.tafa_admin_review_badge(p_request_id uuid,p_status text)
returns boolean language sql security definer set search_path=public as $$
  select public.tafa_admin_set_verification_status(p_request_id,p_status);
$$;
grant execute on function public.tafa_admin_review_badge(uuid,text) to authenticated;

/* Realtime for verification status. */
DO $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tafa_verification_requests') then
    alter publication supabase_realtime add table public.tafa_verification_requests;
  end if;
exception when undefined_object then null;
end $$;
alter table public.tafa_verification_requests replica identity full;

select 'TAFAß V40 — LIMITS + PAGES/GROUPES + VERIFICATION READY' as status;
