/* TAFAß V41 — PREMIUM UX + AGE 18 + PAGES/GROUPES + BADGE OFFICIEL
   Additive patch. Existing data is preserved. Run after the current production SQL. */

create extension if not exists pgcrypto;

/* =========================================================
   1) AGE POLICY — 18+
   ========================================================= */
-- Frontend enforces 18+. This comment documents the production rule.
-- Existing birth dates are never modified.

/* =========================================================
   2) PAGE FOLLOW — reliable RPC
   ========================================================= */
create or replace function public.tafa_toggle_page_follow(p_page_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  uid uuid := auth.uid();
  owner_id uuid;
  already_following boolean;
begin
  if uid is null then return jsonb_build_object('success',false,'message','Connexion requise.'); end if;
  select p.owner_id into owner_id from public.pages p where p.id=p_page_id;
  if owner_id is null then return jsonb_build_object('success',false,'message','Page introuvable.'); end if;
  if owner_id=uid then return jsonb_build_object('success',false,'message','Le propriétaire ne peut pas suivre sa propre Page.'); end if;

  select exists(select 1 from public.page_followers f where f.page_id=p_page_id and f.user_id=uid)
  into already_following;

  if already_following then
    delete from public.page_followers where page_id=p_page_id and user_id=uid;
    return jsonb_build_object('success',true,'followed',false);
  else
    insert into public.page_followers(page_id,user_id) values(p_page_id,uid)
    on conflict(page_id,user_id) do nothing;
    return jsonb_build_object('success',true,'followed',true);
  end if;
exception when others then
  return jsonb_build_object('success',false,'message',sqlerrm);
end $$;
grant execute on function public.tafa_toggle_page_follow(uuid) to authenticated;

/* =========================================================
   3) GROUP JOIN — reliable RPC
   ========================================================= */
create or replace function public.tafa_toggle_group_membership(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  uid uuid := auth.uid();
  g public.groups%rowtype;
  member_id uuid;
begin
  if uid is null then return jsonb_build_object('success',false,'message','Connexion requise.'); end if;
  select * into g from public.groups where id=p_group_id;
  if not found then return jsonb_build_object('success',false,'message','Groupe introuvable.'); end if;

  select gm.id into member_id from public.group_members gm
  where gm.group_id=p_group_id and gm.user_id=uid limit 1;

  if member_id is not null then
    if g.owner_id=uid then return jsonb_build_object('success',false,'message','Le propriétaire ne peut pas quitter son propre groupe.'); end if;
    delete from public.group_members where id=member_id;
    return jsonb_build_object('success',true,'joined',false);
  end if;

  if g.owner_id<>uid and lower(coalesce(g.privacy,'public')) not in ('public','publique') then
    return jsonb_build_object('success',false,'message','Ce groupe est privé. Une invitation ou une validation est nécessaire.');
  end if;

  insert into public.group_members(group_id,user_id,role) values(p_group_id,uid,'member')
  on conflict(group_id,user_id) do nothing;
  return jsonb_build_object('success',true,'joined',true);
exception when others then
  return jsonb_build_object('success',false,'message',sqlerrm);
end $$;
grant execute on function public.tafa_toggle_group_membership(uuid) to authenticated;

/* =========================================================
   4) BADGE OFFICIEL — clean 4-step flow backend
   ========================================================= */
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

create unique index if not exists tafa_verification_one_pending_v41
on public.tafa_verification_requests(user_id) where status='pending';

alter table public.tafa_verification_requests enable row level security;
drop policy if exists tafa_verification_select_own_v41 on public.tafa_verification_requests;
create policy tafa_verification_select_own_v41 on public.tafa_verification_requests
for select to authenticated using(user_id=auth.uid() or public.tafa_is_admin(auth.uid()));

create or replace function public.tafa_create_badge_request(
  p_category text,
  p_identity_name text,
  p_proof_path text,
  p_payment_method text,
  p_payment_reference text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid();
  rid uuid;
  identity text:=left(trim(coalesce(p_identity_name,'')),160);
  category text:=left(trim(coalesce(p_category,'Autre')),120);
  method text:=trim(coalesce(p_payment_method,''));
  ref text:=trim(coalesce(p_payment_reference,''));
begin
  if uid is null then raise exception 'Connexion requise.'; end if;
  if public.tafa_is_admin(uid) then raise exception 'Le compte administrateur possède automatiquement le badge rouge.'; end if;
  if coalesce((select account_status from public.profiles where id=uid),'active')<>'active' then
    raise exception 'Compte non éligible tant qu’il est restreint ou bloqué.';
  end if;
  if identity='' then raise exception 'Nom légal requis.'; end if;
  if category='' then raise exception 'Catégorie requise.'; end if;
  if method not in ('Yas Money','Airtel Money') then raise exception 'Méthode de paiement non prise en charge.'; end if;
  if ref='' then raise exception 'Référence de paiement requise.'; end if;
  if nullif(trim(coalesce(p_proof_path,'')),'') is null then raise exception 'Le justificatif est obligatoire.'; end if;
  if exists(select 1 from public.tafa_verification_requests where user_id=uid and status='pending') then
    raise exception 'Une demande de vérification est déjà en attente.';
  end if;

  insert into public.tafa_verification_requests(
    user_id,fee_mga,payment_reference,reason,status,category,identity_name,proof_path,payment_method
  ) values(uid,25000,ref,identity,'pending',category,identity,nullif(trim(p_proof_path),''),method)
  returning id into rid;
  return rid;
exception when unique_violation then
  raise exception 'Une demande de vérification est déjà en attente.';
end $$;
grant execute on function public.tafa_create_badge_request(text,text,text,text,text) to authenticated;

do $$
begin
  if exists(select 1 from pg_class where relname='tafa_verification_requests') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tafa_verification_requests') then
      alter publication supabase_realtime add table public.tafa_verification_requests;
    end if;
  end if;
exception when undefined_object then null;
end $$;
alter table public.tafa_verification_requests replica identity full;

notify pgrst, 'reload schema';
