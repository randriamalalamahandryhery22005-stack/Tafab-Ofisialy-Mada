/*
 TAFAß — BADGE VÉRIFICATION PREMIUM V2
 Correctif additive pour l'application fournie.
 Objectif: aligner le frontend sur Supabase sans remplacer les tables cœur.
 - badge_requests: dossier de demande utilisé par le frontend
 - payment_transactions: paiement de vérification en attente
 - badge-proofs: stockage privé
 - RPC atomiques pour créer/revoir une demande
*/
create extension if not exists pgcrypto;

-- 1) Table attendue par le frontend
create table if not exists public.badge_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_type text not null default 'Autre',
  reason text,
  document_url text,
  payment_method text,
  payment_reference text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null
);

alter table public.badge_requests add column if not exists badge_type text not null default 'Autre';
alter table public.badge_requests add column if not exists reason text;
alter table public.badge_requests add column if not exists document_url text;
alter table public.badge_requests add column if not exists payment_method text;
alter table public.badge_requests add column if not exists payment_reference text;
alter table public.badge_requests add column if not exists status text not null default 'pending';
alter table public.badge_requests add column if not exists created_at timestamptz not null default now();
alter table public.badge_requests add column if not exists processed_at timestamptz;
alter table public.badge_requests add column if not exists processed_by uuid;

create index if not exists badge_requests_user_created_idx
  on public.badge_requests(user_id, created_at desc);
create index if not exists badge_requests_status_idx
  on public.badge_requests(status, created_at desc);
create unique index if not exists badge_requests_one_pending_per_user_idx
  on public.badge_requests(user_id) where status='pending';

-- 2) RLS: un membre ne voit/modifie que ses propres dossiers.
alter table public.badge_requests enable row level security;
drop policy if exists badge_requests_self_select on public.badge_requests;
create policy badge_requests_self_select
on public.badge_requests for select to authenticated
using (user_id=auth.uid() or public.tafa_is_admin(auth.uid()));

-- Les écritures passent par la RPC ci-dessous; aucune insertion directe côté client.
drop policy if exists badge_requests_self_insert on public.badge_requests;

-- 3) Stockage privé des justificatifs.
insert into storage.buckets(id,name,public)
values('badge-proofs','badge-proofs',false)
on conflict(id) do update set public=false;

drop policy if exists badge_proofs_insert_own on storage.objects;
create policy badge_proofs_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id='badge-proofs'
  and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists badge_proofs_select_own_or_admin on storage.objects;
create policy badge_proofs_select_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id='badge-proofs'
  and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.tafa_is_admin(auth.uid())
  )
);

drop policy if exists badge_proofs_delete_own on storage.objects;
create policy badge_proofs_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id='badge-proofs'
  and (storage.foldername(name))[1]=auth.uid()::text
);

-- 4) Création atomique du paiement en attente + dossier.
create or replace function public.tafa_create_badge_request(
  p_category text,
  p_identity text,
  p_document_path text,
  p_payment_method text,
  p_payment_reference text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  rid uuid;
  method text := trim(coalesce(p_payment_method,''));
  ref text := trim(coalesce(p_payment_reference,''));
  category text := left(trim(coalesce(p_category,'Autre')),120);
  identity text := left(trim(coalesce(p_identity,'')),160);
begin
  if uid is null then raise exception 'Connexion requise.'; end if;
  if public.tafa_is_admin(uid) then
    raise exception 'Le compte administrateur possède automatiquement le badge rouge.';
  end if;
  if coalesce((select account_status from public.profiles where id=uid),'active') <> 'active' then
    raise exception 'Compte non éligible tant qu’il est restreint ou bloqué.';
  end if;
  if identity='' then raise exception 'Indiquez votre nom légal.'; end if;
  if category='' then raise exception 'Choisissez une catégorie.'; end if;
  if method not in ('Yas Money','Airtel Money') then
    raise exception 'Méthode de paiement non prise en charge.';
  end if;
  if ref='' then raise exception 'Ajoutez la référence exacte du paiement.'; end if;
  if p_document_path is null or trim(p_document_path)='' then
    raise exception 'Le justificatif est obligatoire.';
  end if;
  if exists(select 1 from public.badge_requests where user_id=uid and status='pending') then
    raise exception 'Une demande de vérification est déjà en attente.';
  end if;

  -- Un paiement de vérification reste "pending" jusqu'au contrôle administratif.
  insert into public.payment_transactions(
    user_id,method,amount,currency,status,external_reference
  ) values (
    uid,method,25000,'MGA','pending',ref
  );

  insert into public.badge_requests(
    user_id,badge_type,reason,document_url,payment_method,payment_reference,status
  ) values (
    uid,category,identity,p_document_path,method,ref,'pending'
  )
  returning id into rid;

  return rid;
exception
  when unique_violation then
    raise exception 'Une demande de vérification est déjà en attente.';
end;
$$;

grant execute on function public.tafa_create_badge_request(text,text,text,text,text)
to authenticated;

-- 5) Liste admin sécurisée.
create or replace function public.tafa_admin_list_badge_requests(p_limit integer default 50)
returns table(
  id uuid,user_id uuid,display_name text,email text,badge_type text,reason text,
  document_url text,payment_method text,payment_reference text,status text,created_at timestamptz
)
language sql
stable
security definer
set search_path=public
as $$
  select
    b.id,b.user_id,
    coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.username,'Compte'),
    p.email,b.badge_type,b.reason,b.document_url,b.payment_method,b.payment_reference,
    b.status,b.created_at
  from public.badge_requests b
  left join public.profiles p on p.id=b.user_id
  where public.tafa_is_admin(auth.uid())
  order by b.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),200));
$$;
grant execute on function public.tafa_admin_list_badge_requests(integer) to authenticated;

-- 6) Décision admin: verrouillage de ligne + activation du badge bleu.
create or replace function public.tafa_admin_review_badge(
  p_request_id uuid,
  p_status text
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid;
  current_status text;
begin
  if not public.tafa_is_admin(auth.uid()) then
    raise exception 'Accès administrateur requis';
  end if;
  if p_status not in ('approved','rejected') then
    raise exception 'Statut de vérification invalide';
  end if;

  select user_id,status
    into uid,current_status
  from public.badge_requests
  where id=p_request_id
  for update;

  if uid is null then raise exception 'Demande introuvable'; end if;
  if current_status <> 'pending' then
    raise exception 'Cette demande a déjà été traitée.';
  end if;

  update public.badge_requests
  set status=p_status, processed_at=now(), processed_by=auth.uid()
  where id=p_request_id;

  if p_status='approved' then
    update public.profiles set is_verified=true where id=uid;
  end if;

  return true;
end;
$$;
grant execute on function public.tafa_admin_review_badge(uuid,text) to authenticated;

-- 7) Realtime pour le suivi du membre et le dashboard admin.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='badge_requests'
  ) then
    alter publication supabase_realtime add table public.badge_requests;
  end if;
exception when undefined_object then
  null;
end $$;

alter table public.badge_requests replica identity full;

notify pgrst,'reload schema';
select 'TAFAß BADGE VÉRIFICATION PREMIUM V2 READY' as status;
