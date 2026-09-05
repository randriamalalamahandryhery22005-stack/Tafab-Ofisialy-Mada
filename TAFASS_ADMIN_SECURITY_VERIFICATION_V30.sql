/* TAFAß V30 — VERIFIED BADGE + ADMIN IDENTITY PROTECTION + MEDIA PROTECTION + APPEALS
   Additive migration. No existing rows are deleted. Run after the existing admin/schema migrations. */

create extension if not exists pgcrypto;

alter table public.profiles add column if not exists is_verified boolean not null default false;
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists admin_badge boolean not null default false;
alter table public.profiles add column if not exists account_status text not null default 'active';

create table if not exists public.tafa_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  fee_mga bigint not null default 25000 check (fee_mga > 0),
  payment_reference text not null,
  reason text,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null
);
create index if not exists tafa_verification_user_idx on public.tafa_verification_requests(user_id,created_at desc);
create index if not exists tafa_verification_pending_idx on public.tafa_verification_requests(status) where status='pending';

create table if not exists public.tafa_admin_protected_media (
  id uuid primary key default gen_random_uuid(),
  sha256 text unique,
  media_kind text not null,
  media_url text,
  created_at timestamptz not null default now()
);
create index if not exists tafa_admin_media_kind_idx on public.tafa_admin_protected_media(media_kind);

create table if not exists public.tafa_account_appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null
);
create index if not exists tafa_appeals_user_idx on public.tafa_account_appeals(user_id,created_at desc);
create index if not exists tafa_appeals_pending_idx on public.tafa_account_appeals(status) where status='pending';

alter table public.tafa_verification_requests enable row level security;
alter table public.tafa_admin_protected_media enable row level security;
alter table public.tafa_account_appeals enable row level security;

drop policy if exists tafa_verification_self_select on public.tafa_verification_requests;
create policy tafa_verification_self_select on public.tafa_verification_requests for select to authenticated using(user_id=auth.uid() or public.tafa_is_admin(auth.uid()));
drop policy if exists tafa_admin_media_read on public.tafa_admin_protected_media;
create policy tafa_admin_media_read on public.tafa_admin_protected_media for select to authenticated using(true);
drop policy if exists tafa_appeals_self_select on public.tafa_account_appeals;
create policy tafa_appeals_self_select on public.tafa_account_appeals for select to authenticated using(user_id=auth.uid() or public.tafa_is_admin(auth.uid()));

-- Mark every current admin profile as permanently admin/red-badge identity.
update public.profiles p
set is_admin=true, admin_badge=true
where exists (select 1 from public.tafa_admin_roles r where r.user_id=p.id and r.role in ('super_admin','admin'));

-- Keep the admin flag synchronized when a role is granted/revoked.
create or replace function public.tafa_sync_admin_profile()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.profiles p
  set is_admin=exists(select 1 from public.tafa_admin_roles r where r.user_id=p.id and r.role in ('super_admin','admin')),
      admin_badge=exists(select 1 from public.tafa_admin_roles r where r.user_id=p.id and r.role in ('super_admin','admin'))
  where p.id=coalesce(new.user_id,old.user_id);
  return coalesce(new,old);
end $$;
drop trigger if exists tafa_sync_admin_profile_trg on public.tafa_admin_roles;
create trigger tafa_sync_admin_profile_trg after insert or update or delete on public.tafa_admin_roles for each row execute function public.tafa_sync_admin_profile();

-- Admin identity cannot be copied by ordinary accounts: exact full name, username or email is reserved.
create or replace function public.tafa_protect_admin_identity()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  admin_name text;
  admin_email text;
  admin_username text;
begin
  if public.tafa_is_admin(new.id) then return new; end if;
  if new.email is not null and exists(
    select 1 from auth.users au join public.tafa_admin_roles ar on ar.user_id=au.id
    where ar.role in ('super_admin','admin') and lower(au.email)=lower(new.email) and au.id<>new.id
  ) then raise exception 'E-mail réservé à l’administration Tafaß'; end if;
  if new.username is not null and exists(
    select 1 from public.profiles ap join public.tafa_admin_roles ar on ar.user_id=ap.id
    where ar.role in ('super_admin','admin') and lower(ap.username)=lower(new.username) and ap.id<>new.id
  ) then raise exception 'Nom d’utilisateur réservé à l’administration Tafaß'; end if;
  admin_name=lower(trim(concat_ws(' ',new.first_name,new.last_name)));
  if admin_name<>'' and exists(
    select 1 from public.profiles ap join public.tafa_admin_roles ar on ar.user_id=ap.id
    where ar.role in ('super_admin','admin') and lower(trim(concat_ws(' ',ap.first_name,ap.last_name)))=admin_name and ap.id<>new.id
  ) then raise exception 'Nom réservé à l’administration Tafaß'; end if;
  return new;
end $$;
drop trigger if exists tafa_protect_admin_identity_trg on public.profiles;
create trigger tafa_protect_admin_identity_trg before insert or update of first_name,last_name,username,email on public.profiles for each row execute function public.tafa_protect_admin_identity();

-- Every database write also respects restricted accounts.
create or replace function public.tafa_account_guard(p_user_id uuid default auth.uid())
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('allowed',coalesce(account_status,'active') not in ('restricted','blocked'),'status',coalesce(account_status,'active'), 'message',case when account_status='restricted' then 'Votre compte est restreint. Envoyez une demande de réactivation.' when account_status='blocked' then 'Votre compte est bloqué.' else null end)
  from public.profiles where id=p_user_id;
$$;
grant execute on function public.tafa_account_guard(uuid) to authenticated;

create or replace function public.tafa_block_restricted_write()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if coalesce((select account_status from public.profiles where id=auth.uid()),'active') in ('restricted','blocked') then
    raise exception 'Compte restreint ou bloqué';
  end if;
  return new;
end $$;
drop trigger if exists tafa_posts_restricted_write_trg on public.posts;
create trigger tafa_posts_restricted_write_trg before insert or update on public.posts for each row execute function public.tafa_block_restricted_write();

-- Register admin avatar/cover URLs automatically and block direct reuse in publications.
create or replace function public.tafa_register_admin_profile_media()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if public.tafa_is_admin(new.id) then
    if new.avatar_url is not null then insert into public.tafa_admin_protected_media(media_kind,media_url) values('profile_avatar',new.avatar_url) on conflict do nothing; end if;
    if new.cover_url is not null then insert into public.tafa_admin_protected_media(media_kind,media_url) values('profile_cover',new.cover_url) on conflict do nothing; end if;
  end if;
  return new;
end $$;
drop trigger if exists tafa_register_admin_profile_media_trg on public.profiles;
create trigger tafa_register_admin_profile_media_trg after insert or update of avatar_url,cover_url on public.profiles for each row execute function public.tafa_register_admin_profile_media();

insert into public.tafa_admin_protected_media(media_kind,media_url)
select 'profile_avatar',p.avatar_url from public.profiles p where p.is_admin=true and p.avatar_url is not null
on conflict do nothing;
insert into public.tafa_admin_protected_media(media_kind,media_url)
select 'profile_cover',p.cover_url from public.profiles p where p.is_admin=true and p.cover_url is not null
on conflict do nothing;

create or replace function public.tafa_moderation_check_media(p_sha256 text,p_kind text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_hit boolean;
begin
  select exists(select 1 from public.tafa_admin_protected_media where sha256=p_sha256) into v_hit;
  if v_hit and not public.tafa_is_admin(auth.uid()) then
    update public.profiles set account_status='restricted' where id=auth.uid();
    insert into public.tafa_account_appeals(user_id,reason,status) values(auth.uid(),'Restriction automatique : utilisation d’un média protégé de l’administration.', 'pending');
    return jsonb_build_object('ok',false,'message','Média protégé : votre compte a été restreint.');
  end if;
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.tafa_moderation_check_media(text,text) to authenticated;

create or replace function public.tafa_moderation_check_url(p_url text,p_kind text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_hit boolean;
begin
  select exists(select 1 from public.tafa_admin_protected_media where media_url=p_url) into v_hit;
  if v_hit and not public.tafa_is_admin(auth.uid()) then
    update public.profiles set account_status='restricted' where id=auth.uid();
    insert into public.tafa_account_appeals(user_id,reason,status) values(auth.uid(),'Restriction automatique : réutilisation d’un média protégé de l’administration.', 'pending');
    return jsonb_build_object('ok',false,'message','Média protégé : votre compte a été restreint.');
  end if;
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.tafa_moderation_check_url(text,text) to authenticated;

create or replace function public.tafa_admin_register_media_hash(p_sha256 text,p_kind text,p_url text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
  insert into public.tafa_admin_protected_media(sha256,media_kind,media_url) values(p_sha256,p_kind,p_url) on conflict(sha256) do update set media_url=excluded.media_url,media_kind=excluded.media_kind;
  return true;
end $$;
grant execute on function public.tafa_admin_register_media_hash(text,text,text) to authenticated;

-- Verification request: payment must be recorded as paid for the same reference and amount.
create or replace function public.tafa_submit_verification_request(p_payment_reference text,p_reason text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); pid uuid; okpay boolean;
begin
  if uid is null then raise exception 'Non authentifié'; end if;
  if public.tafa_is_admin(uid) then raise exception 'Le compte administrateur possède automatiquement le badge rouge'; end if;
  if coalesce((select account_status from public.profiles where id=uid),'active')<>'active' then raise exception 'Compte non éligible tant qu’il est restreint ou bloqué'; end if;
  select exists(select 1 from public.payment_transactions where user_id=uid and status='paid' and amount>=25000 and external_reference=p_payment_reference) into okpay;
  if not okpay then raise exception 'Paiement de vérification introuvable ou non validé. Le montant minimum est de 25 000 Ar.'; end if;
  insert into public.tafa_verification_requests(user_id,payment_reference,reason) values(uid,p_payment_reference,p_reason) returning id into pid;
  return pid;
end $$;
grant execute on function public.tafa_submit_verification_request(text,text) to authenticated;

create or replace function public.tafa_admin_list_verification_requests(p_limit integer default 50)
returns table(id uuid,user_id uuid,display_name text,email text,fee_mga bigint,payment_reference text,reason text,status text,created_at timestamptz)
language sql stable security definer set search_path=public as $$
 select v.id,v.user_id,coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.username,'Compte'),p.email,v.fee_mga,v.payment_reference,v.reason,v.status,v.created_at
 from public.tafa_verification_requests v left join public.profiles p on p.id=v.user_id
 where public.tafa_is_admin(auth.uid()) order by v.created_at desc limit greatest(1,least(p_limit,200));
$$;
grant execute on function public.tafa_admin_list_verification_requests(integer) to authenticated;

create or replace function public.tafa_admin_set_verification_status(p_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path=public as $$
declare uid uuid;
begin
 if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
 if p_status not in ('approved','rejected') then raise exception 'Statut invalide'; end if;
 select user_id into uid from public.tafa_verification_requests where id=p_id for update;
 if uid is null then raise exception 'Demande introuvable'; end if;
 update public.tafa_verification_requests set status=p_status,processed_at=now(),processed_by=auth.uid() where id=p_id;
 if p_status='approved' then update public.profiles set is_verified=true where id=uid; end if;
 return true;
end $$;
grant execute on function public.tafa_admin_set_verification_status(uuid,text) to authenticated;

create or replace function public.tafa_submit_account_appeal(p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare idd uuid;
begin
 if auth.uid() is null then raise exception 'Non authentifié'; end if;
 if coalesce((select account_status from public.profiles where id=auth.uid()),'active') not in ('restricted','blocked') then raise exception 'Votre compte ne nécessite pas de réactivation'; end if;
 insert into public.tafa_account_appeals(user_id,reason) values(auth.uid(),left(trim(p_reason),1000)) returning id into idd;
 return idd;
end $$;
grant execute on function public.tafa_submit_account_appeal(text) to authenticated;

create or replace function public.tafa_admin_set_appeal_status(p_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path=public as $$
declare uid uuid;
begin
 if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
 if p_status not in ('approved','rejected') then raise exception 'Statut invalide'; end if;
 select user_id into uid from public.tafa_account_appeals where id=p_id for update;
 if uid is null then raise exception 'Demande introuvable'; end if;
 update public.tafa_account_appeals set status=p_status,processed_at=now(),processed_by=auth.uid() where id=p_id;
 if p_status='approved' then update public.profiles set account_status='active' where id=uid; end if;
 return true;
end $$;
grant execute on function public.tafa_admin_set_appeal_status(uuid,text) to authenticated;


create or replace function public.tafa_admin_list_account_appeals(p_limit integer default 50)
returns table(id uuid,user_id uuid,display_name text,email text,reason text,status text,created_at timestamptz)
language sql stable security definer set search_path=public as $$
 select a.id,a.user_id,coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.username,'Compte'),p.email,a.reason,a.status,a.created_at
 from public.tafa_account_appeals a left join public.profiles p on p.id=a.user_id
 where public.tafa_is_admin(auth.uid()) order by a.created_at desc limit greatest(1,least(p_limit,200));
$$;
grant execute on function public.tafa_admin_list_account_appeals(integer) to authenticated;

create or replace function public.tafa_block_restricted_profile_write()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not public.tafa_is_admin(new.id) and coalesce(old.account_status,'active') in ('restricted','blocked') then raise exception 'Compte restreint ou bloqué'; end if;
 if not public.tafa_is_admin(new.id) and (new.avatar_url is distinct from old.avatar_url or new.cover_url is distinct from old.cover_url) then
   if exists(select 1 from public.tafa_admin_protected_media m where m.media_url=new.avatar_url or m.media_url=new.cover_url) then
     new.account_status='restricted';
     insert into public.tafa_account_appeals(user_id,reason,status) values(new.id,'Restriction automatique : utilisation d’une image protégée de l’administration sur le profil.','pending');
     raise exception 'Image protégée de l’administration Tafaß';
   end if;
 end if;
 return new;
end $$;
drop trigger if exists tafa_block_restricted_profile_write_trg on public.profiles;
create trigger tafa_block_restricted_profile_write_trg before update on public.profiles for each row execute function public.tafa_block_restricted_profile_write();

-- Catch publication attempts that reuse a protected admin URL.
create or replace function public.tafa_block_protected_post_media()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.media_url is not null and exists(select 1 from public.tafa_admin_protected_media where media_url=new.media_url) and not public.tafa_is_admin(new.user_id) then
   update public.profiles set account_status='restricted' where id=new.user_id;
   insert into public.tafa_account_appeals(user_id,reason,status) values(new.user_id,'Restriction automatique : publication d’un média protégé de l’administration.','pending');
   raise exception 'Média protégé de l’administration Tafaß';
 end if;
 return new;
end $$;
drop trigger if exists tafa_block_protected_post_media_trg on public.posts;
create trigger tafa_block_protected_post_media_trg before insert or update of media_url on public.posts for each row execute function public.tafa_block_protected_post_media();

-- Stats include pending verification requests.
create or replace function public.tafa_admin_total_stats()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r jsonb;
begin
 if not public.tafa_is_admin(auth.uid()) then raise exception 'Accès administrateur requis'; end if;
 select jsonb_build_object(
 'total_accounts',(select count(*) from public.profiles),
 'active_accounts',(select count(*) from public.profiles where coalesce(account_status,'active')='active'),
 'blocked_accounts',(select count(*) from public.profiles where account_status in ('blocked','restricted')),
 'total_posts',(select count(*) from public.posts),
 'total_comments',(select count(*) from public.comments),
 'total_notifications',(select count(*) from public.notifications),
 'total_coins',(select coalesce(sum(coins),0) from public.tafab_wallets),
 'total_creator_earnings_mga',(select coalesce(sum(earnings_mga),0) from public.tafab_wallets),
 'pending_withdrawals',(select count(*) from public.tafab_withdrawal_requests where status='pending'),
 'pending_payments',(select count(*) from public.payment_transactions where status='pending'),
 'pending_reports',(select count(*) from public.profile_reports where status='pending'),
 'pending_verifications',(select count(*) from public.tafa_verification_requests where status='pending'),
 'pending_total',(select count(*) from public.tafab_withdrawal_requests where status='pending')+(select count(*) from public.payment_transactions where status='pending')+(select count(*) from public.profile_reports where status='pending')+(select count(*) from public.tafa_verification_requests where status='pending')
 ) into r;
 return r;
end $$;
grant execute on function public.tafa_admin_total_stats() to authenticated;

notify pgrst,'reload schema';
select 'TAFAß V30 SECURITY + VERIFIED BADGE READY' as status;
