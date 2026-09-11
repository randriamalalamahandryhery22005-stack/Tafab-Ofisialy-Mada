-- ============================================================
-- Tafaß V76 — Monetisation Admin + Referral activation + Profile identity
-- Incremental: run AFTER V74/V74.1 platform SQL.
-- ============================================================

-- 1) Admin detection: use the real column present in this project.
-- Do NOT reference profiles.role or profiles.admin_badge.
create or replace function public.tafa_v74_is_admin(p_uid uuid)
returns boolean
language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.profiles p
    where p.id=p_uid and coalesce(p.is_admin,false)=true
  );
$$;

-- 2) Every account keeps a deterministic referral code.
-- The code exists for everyone, but it becomes usable only after the owner
-- activates creator monetisation (Admin is automatically active below).
create or replace function public.tafa_v74_referral_code(p_uid uuid)
returns text
language sql immutable as $$
  select 'TAFASS-' || upper(substr(md5(p_uid::text),1,8));
$$;

create or replace function public.tafa_v74_ensure_wallet(p_uid uuid)
returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into public.tafa_platform_wallets_v74(user_id,referral_code)
  values(p_uid,public.tafa_v74_referral_code(p_uid))
  on conflict(user_id) do update
    set referral_code=coalesce(public.tafa_platform_wallets_v74.referral_code,excluded.referral_code),
        updated_at=now();

  begin
    insert into public.tafab_wallets(user_id,coins,earnings_mga,pending_earnings_mga,lifetime_earnings_mga,total_withdrawn_mga)
    values(p_uid,0,0,0,0,0)
    on conflict(user_id) do nothing;
  exception when undefined_table then null;
  end;
end;
$$;

-- 3) Preserve the first/last name entered during registration.
-- Also repairs profiles that were incorrectly displayed as "Membre Tafaß".
-- The exception block prevents a metadata/profile compatibility issue from
-- blocking a Supabase Auth signup.
create or replace function public.tafa_v76_sync_profile_identity()
returns trigger
language plpgsql security definer set search_path=public as $$
declare
  fn text := nullif(trim(coalesce(new.raw_user_meta_data->>'first_name','')),'');
  ln text := nullif(trim(coalesce(new.raw_user_meta_data->>'last_name','')),'');
  ph text := nullif(trim(coalesce(new.raw_user_meta_data->>'phone','')),'');
  pc text := nullif(trim(coalesce(new.raw_user_meta_data->>'phone_code','')),'');
  co text := nullif(trim(coalesce(new.raw_user_meta_data->>'country','')),'');
begin

  insert into public.profiles(id,first_name,last_name,email,phone,phone_code,country,updated_at)
  values(new.id,coalesce(fn,''),coalesce(ln,''),new.email,ph,pc,coalesce(co,'Madagascar'),now())
  on conflict(id) do update set
    first_name=case
      when fn is not null and (nullif(trim(coalesce(public.profiles.first_name,'')),'') is null or lower(trim(coalesce(public.profiles.first_name,'') || ' ' || coalesce(public.profiles.last_name,''))) in ('membre tafaß','membre tafass')) then fn
      else public.profiles.first_name
    end,
    last_name=case
      when ln is not null and (nullif(trim(coalesce(public.profiles.last_name,'')),'') is null or lower(trim(coalesce(public.profiles.first_name,'') || ' ' || coalesce(public.profiles.last_name,''))) in ('membre tafaß','membre tafass')) then ln
      else public.profiles.last_name
    end,
    email=coalesce(nullif(trim(coalesce(public.profiles.email,'')),''),new.email),
    phone=coalesce(nullif(trim(coalesce(public.profiles.phone,'')),''),ph),
    phone_code=coalesce(nullif(trim(coalesce(public.profiles.phone_code,'')),''),pc),
    country=coalesce(nullif(trim(coalesce(public.profiles.country,'')),''),co,'Madagascar'),
    updated_at=now();
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists tafa_v76_sync_profile_identity on auth.users;
create trigger tafa_v76_sync_profile_identity
after insert or update on auth.users
for each row execute function public.tafa_v76_sync_profile_identity();

-- Repair existing profiles from Auth metadata where the public profile is empty
-- or was replaced by the generic identity.
update public.profiles p
set
  first_name=case
    when lower(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))) in ('membre tafaß','membre tafass')
      then coalesce(nullif(trim(u.raw_user_meta_data->>'first_name'),''),p.first_name)
    else coalesce(nullif(trim(p.first_name),''),nullif(trim(u.raw_user_meta_data->>'first_name'),''),p.first_name)
  end,
  last_name=case
    when lower(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))) in ('membre tafaß','membre tafass')
      then coalesce(nullif(trim(u.raw_user_meta_data->>'last_name'),''),p.last_name)
    else coalesce(nullif(trim(p.last_name),''),nullif(trim(u.raw_user_meta_data->>'last_name'),''),p.last_name)
  end,
  email=coalesce(nullif(trim(p.email),''),u.email),
  updated_at=now()
from auth.users u
where u.id=p.id
  and (
    nullif(trim(coalesce(p.first_name,'')),'') is null
    or nullif(trim(coalesce(p.last_name,'')),'') is null
    or lower(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))) in ('membre tafaß','membre tafass')
  );

-- 4) Admin monetisation is automatic.
-- Admin never needs to buy coins or request creator monetisation.
create or replace function public.tafa_v76_sync_admin_monetization()
returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if coalesce(new.is_admin,false)=true then
    begin
      insert into public.tafab_creator_monetization(
        user_id,status,enabled,min_withdrawal_mga,revenue_share_percent,coins_to_mga
      ) values(
        new.id,'approved',true,1000,100,10
      )
      on conflict(user_id) do update set
        status='approved',
        enabled=true,
        revenue_share_percent=100;
    exception when undefined_table then null;
    end;
    perform public.tafa_v74_ensure_wallet(new.id);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists tafa_v76_admin_monetization on public.profiles;
create trigger tafa_v76_admin_monetization
after insert or update of is_admin on public.profiles
for each row execute function public.tafa_v76_sync_admin_monetization();

-- Activate every Admin account that already exists.
do $$
declare r record;
begin
  for r in select id from public.profiles where coalesce(is_admin,false)=true loop
    begin
      insert into public.tafab_creator_monetization(
        user_id,status,enabled,min_withdrawal_mga,revenue_share_percent,coins_to_mga
      ) values(r.id,'approved',true,1000,100,10)
      on conflict(user_id) do update set status='approved',enabled=true,revenue_share_percent=100;
    exception when undefined_table then null;
    end;
    perform public.tafa_v74_ensure_wallet(r.id);
  end loop;
end $$;

-- Ensure every existing account has a code.
insert into public.tafa_platform_wallets_v74(user_id,referral_code)
select p.id,public.tafa_v74_referral_code(p.id)
from public.profiles p
on conflict(user_id) do update
set referral_code=coalesce(public.tafa_platform_wallets_v74.referral_code,excluded.referral_code),updated_at=now();

-- 5) Replace the new-account reward function so a referral code is rewarded
-- only when its owner already has active monetisation. Invalid/inactive codes
-- never block account creation.
create or replace function public.tafa_v74_on_new_account()
returns trigger
language plpgsql security definer set search_path=public as $$
declare
  ref text;
  ref_owner uuid;
  ref_active boolean := false;
begin
  perform public.tafa_v74_ensure_wallet(new.id);
  perform public.tafa_v74_credit(new.id,1000,'signup','signup:'||new.id::text,'Bonus de bienvenue Tafaß');

  ref := upper(trim(coalesce(new.raw_user_meta_data->>'referral_code','')));
  if ref<>'' then
    select w.user_id into ref_owner
    from public.tafa_platform_wallets_v74 w
    where upper(w.referral_code)=ref
    limit 1;

    if ref_owner is not null and ref_owner<>new.id then
      select exists(
        select 1
        from public.profiles rp
        left join public.tafab_creator_monetization cm on cm.user_id=rp.id
        where rp.id=ref_owner
          and (
            coalesce(rp.is_admin,false)=true
            or (coalesce(cm.enabled,false)=true and cm.status='approved')
          )
      ) into ref_active;

      if ref_active then
        update public.tafa_platform_wallets_v74
        set referral_uses=referral_uses+1,updated_at=now()
        where user_id=ref_owner;

        perform public.tafa_v74_credit(ref_owner,5000,'referral','referral:'||new.id::text,
          'Bonus de parrainage',new.id,new.id);
        perform public.tafa_v74_credit(new.id,500,'referral_new_user','referral_new:'||new.id::text,
          'Bonus d’inscription avec parrainage',ref_owner,new.id);
        perform public.tafa_v74_reward_admin('referral','admin_referral:'||new.id::text,
          new.id,new.id,25,'Activité de parrainage');
      end if;
    end if;
  end if;

  perform public.tafa_v74_reward_admin('signup','admin_signup:'||new.id::text,
    new.id,new.id,2500,'Nouveau compte créé');
  return new;
end;
$$;

drop trigger if exists tafa_v74_auth_new_account on auth.users;
create trigger tafa_v74_auth_new_account
after insert on auth.users
for each row execute function public.tafa_v74_on_new_account();

-- 6) Existing Admin wallet is ready for platform withdrawals.
-- The existing V74 withdrawal RPC remains server-side and requires an active
-- payout method. It is intentionally not a coin-purchase path.
