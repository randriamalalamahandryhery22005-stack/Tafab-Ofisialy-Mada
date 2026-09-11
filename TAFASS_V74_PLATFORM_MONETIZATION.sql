-- ============================================================
-- Tafaß V74 — Platform monetisation + referrals + admin wallet
-- Server-side only. Idempotent rewards; invalid referral codes never
-- block registration.
-- ============================================================

create table if not exists public.tafa_platform_wallets_v74 (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coins bigint not null default 0,
  earnings_mga numeric(18,2) not null default 0,
  lifetime_earnings_mga numeric(18,2) not null default 0,
  total_withdrawn_mga numeric(18,2) not null default 0,
  referral_code text unique,
  referral_uses bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.tafa_platform_coin_ledger_v74 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  coins bigint not null,
  amount_mga numeric(18,2) not null default 0,
  event_type text not null,
  event_key text not null unique,
  source_user_id uuid references auth.users(id) on delete set null,
  source_id uuid,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.tafa_admin_withdrawals_v74 (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  amount_mga numeric(18,2) not null check (amount_mga >= 1000),
  payout_method_id uuid,
  status text not null default 'pending' check (status in ('pending','paid','rejected')),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  admin_note text
);

alter table public.tafa_platform_wallets_v74 enable row level security;
alter table public.tafa_platform_coin_ledger_v74 enable row level security;
alter table public.tafa_admin_withdrawals_v74 enable row level security;

drop policy if exists "platform wallet own read" on public.tafa_platform_wallets_v74;
create policy "platform wallet own read" on public.tafa_platform_wallets_v74 for select using (auth.uid() = user_id);
drop policy if exists "platform ledger own read" on public.tafa_platform_coin_ledger_v74;
create policy "platform ledger own read" on public.tafa_platform_coin_ledger_v74 for select using (auth.uid() = user_id);
drop policy if exists "admin withdrawals own read" on public.tafa_admin_withdrawals_v74;
create policy "admin withdrawals own read" on public.tafa_admin_withdrawals_v74 for select using (auth.uid() = admin_user_id);

create or replace function public.tafa_v74_is_admin(p_uid uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=p_uid and (p.role='admin' or coalesce(p.is_admin,false)=true));
$$;

create or replace function public.tafa_v74_referral_code(p_uid uuid)
returns text language sql immutable as $$
  select 'TAFASS-' || upper(substr(md5(p_uid::text),1,8));
$$;

create or replace function public.tafa_v74_ensure_wallet(p_uid uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.tafa_platform_wallets_v74(user_id,referral_code)
  values(p_uid,public.tafa_v74_referral_code(p_uid))
  on conflict(user_id) do update set referral_code=coalesce(public.tafa_platform_wallets_v74.referral_code,excluded.referral_code),updated_at=now();

  -- Keep the existing creator wallet in sync where it already exists.
  insert into public.tafab_wallets(user_id,coins,earnings_mga,pending_earnings_mga,lifetime_earnings_mga,total_withdrawn_mga)
  values(p_uid,0,0,0,0,0)
  on conflict(user_id) do nothing;
exception when undefined_table then
  null;
end;
$$;

create or replace function public.tafa_v74_credit(p_uid uuid,p_coins bigint,p_event_type text,p_event_key text,p_description text,p_source_user_id uuid default null,p_source_id uuid default null)
returns bigint language plpgsql security definer set search_path=public as $$
declare
  inserted_count int;
  mga numeric(18,2);
  new_coins bigint;
begin
  if p_uid is null or p_coins <= 0 or coalesce(trim(p_event_key),'')='' then return 0; end if;
  perform public.tafa_v74_ensure_wallet(p_uid);
  mga := floor(p_coins::numeric / 10);
  insert into public.tafa_platform_coin_ledger_v74(user_id,coins,amount_mga,event_type,event_key,source_user_id,source_id,description)
  values(p_uid,p_coins,mga,p_event_type,p_event_key,p_source_user_id,p_source_id,p_description)
  on conflict(event_key) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count=0 then return 0; end if;

  update public.tafa_platform_wallets_v74
    set coins=coins+p_coins, earnings_mga=earnings_mga+mga, lifetime_earnings_mga=lifetime_earnings_mga+mga, updated_at=now()
    where user_id=p_uid returning coins into new_coins;

  begin
    update public.tafab_wallets
      set coins=coalesce(coins,0)+p_coins,
          earnings_mga=coalesce(earnings_mga,0)+mga,
          lifetime_earnings_mga=coalesce(lifetime_earnings_mga,0)+mga,
          updated_at=now()
      where user_id=p_uid;
  exception when undefined_table then null; end;
  return new_coins;
end;
$$;

create or replace function public.tafa_v74_reward_admin(p_event_type text,p_event_key text,p_source_user_id uuid default null,p_source_id uuid default null,p_coins bigint default 10,p_description text default 'Activité de la plateforme')
returns bigint language plpgsql security definer set search_path=public as $$
declare aid uuid; begin
  select p.id into aid from public.profiles p where p.role='admin' or coalesce(p.is_admin,false)=true order by p.created_at nulls first limit 1;
  if aid is null then return 0; end if;
  return public.tafa_v74_credit(aid,p_coins,'platform_'||p_event_type,p_event_key,p_description,p_source_user_id,p_source_id);
end; $$;

-- New account: every account starts with a small platform balance. Admin receives
-- a larger platform share, but only once per auth user.
create or replace function public.tafa_v74_on_new_account()
returns trigger language plpgsql security definer set search_path=public as $$
declare ref text; ref_owner uuid; begin
  perform public.tafa_v74_ensure_wallet(new.id);
  perform public.tafa_v74_credit(new.id,1000,'signup','signup:'||new.id::text,'Bonus de bienvenue Tafaß');
  ref := upper(trim(coalesce(new.raw_user_meta_data->>'referral_code','')));
  if ref<>'' then
    select user_id into ref_owner from public.tafa_platform_wallets_v74 where upper(referral_code)=ref limit 1;
    if ref_owner is not null and ref_owner<>new.id then
      update public.tafa_platform_wallets_v74 set referral_uses=referral_uses+1,updated_at=now() where user_id=ref_owner;
      perform public.tafa_v74_credit(ref_owner,5000,'referral','referral:'||new.id::text, 'Bonus de parrainage',new.id,new.id);
      perform public.tafa_v74_credit(new.id,500,'referral_new_user','referral_new:'||new.id::text,'Bonus d’inscription avec parrainage',ref_owner,new.id);
      perform public.tafa_v74_reward_admin('referral','admin_referral:'||new.id::text,new.id,new.id,25,'Activité de parrainage');
    end if;
  end if;
  perform public.tafa_v74_reward_admin('signup','admin_signup:'||new.id::text,new.id,new.id,2500,'Nouveau compte créé');
  return new;
end; $$;

drop trigger if exists tafa_v74_auth_new_account on auth.users;
create trigger tafa_v74_auth_new_account after insert on auth.users for each row execute function public.tafa_v74_on_new_account();

-- Generic post reward: creator earns more than the user who interacted; admin
-- receives a smaller platform share. Duplicate events are impossible.
create or replace function public.tafa_v74_post_reward()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.tafa_v74_credit(new.user_id,100,'publication','post:'||new.id::text,'Publication publiée',new.user_id,new.id);
  perform public.tafa_v74_reward_admin('publication','admin_post:'||new.id::text,new.user_id,new.id,25,'Nouvelle publication');
  return new;
end; $$;

drop trigger if exists tafa_v74_posts_reward on public.posts;
create trigger tafa_v74_posts_reward after insert on public.posts for each row execute function public.tafa_v74_post_reward();

create or replace function public.tafa_v74_reaction_reward()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner uuid; begin
  select user_id into owner from public.posts where id=new.post_id;
  if owner is not null and owner<>new.user_id then
    perform public.tafa_v74_credit(owner,5,'reaction','reaction:'||new.id::text,'Réaction reçue',new.user_id,new.post_id);
    perform public.tafa_v74_reward_admin('reaction','admin_reaction:'||new.id::text,new.user_id,new.post_id,2,'Réaction sur une publication');
  end if;
  return new;
end; $$;

drop trigger if exists tafa_v74_post_reaction_reward on public.post_reactions;
create trigger tafa_v74_post_reaction_reward after insert on public.post_reactions for each row execute function public.tafa_v74_reaction_reward();

create or replace function public.tafa_v74_comment_reward()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner uuid; begin
  select user_id into owner from public.posts where id=new.post_id;
  if owner is not null and owner<>new.user_id then
    perform public.tafa_v74_credit(owner,10,'comment','comment:'||new.id::text,'Commentaire reçu',new.user_id,new.post_id);
    perform public.tafa_v74_reward_admin('comment','admin_comment:'||new.id::text,new.user_id,new.post_id,3,'Commentaire sur une publication');
  end if;
  return new;
end; $$;

drop trigger if exists tafa_v74_comment_reward on public.comments;
create trigger tafa_v74_comment_reward after insert on public.comments for each row execute function public.tafa_v74_comment_reward();

create or replace function public.tafa_v74_share_reward()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner uuid; begin
  select user_id into owner from public.posts where id=new.post_id;
  if owner is not null and owner<>new.user_id then
    perform public.tafa_v74_credit(owner,15,'share','share:'||new.id::text,'Partage reçu',new.user_id,new.post_id);
    perform public.tafa_v74_reward_admin('share','admin_share:'||new.id::text,new.user_id,new.post_id,4,'Partage d’une publication');
  end if;
  return new;
end; $$;

drop trigger if exists tafa_v74_share_reward on public.post_shares;
create trigger tafa_v74_share_reward after insert on public.post_shares for each row execute function public.tafa_v74_share_reward();

-- Follows and friendships also count as real engagement.
create or replace function public.tafa_v74_follow_reward()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.following_id<>new.follower_id then
    perform public.tafa_v74_credit(new.following_id,8,'follow','follow:'||new.id::text,'Nouvel abonné',new.follower_id,new.id);
    perform public.tafa_v74_reward_admin('follow','admin_follow:'||new.id::text,new.follower_id,new.id,2,'Nouvel abonnement');
  end if; return new;
end; $$;
drop trigger if exists tafa_v74_follow_reward on public.follows;
create trigger tafa_v74_follow_reward after insert on public.follows for each row execute function public.tafa_v74_follow_reward();

create or replace function public.tafa_v74_friend_reward()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.user_id<>new.friend_id then
    perform public.tafa_v74_credit(new.user_id,10,'friendship','friendship:'||new.id::text||':a','Nouvelle amitié',new.friend_id,new.id);
    perform public.tafa_v74_credit(new.friend_id,10,'friendship','friendship:'||new.id::text||':b','Nouvelle amitié',new.user_id,new.id);
    perform public.tafa_v74_reward_admin('friendship','admin_friendship:'||new.id::text,new.user_id,new.id,5,'Nouvelle connexion entre membres');
  end if; return new;
end; $$;
drop trigger if exists tafa_v74_friend_reward on public.friendships;
create trigger tafa_v74_friend_reward after insert on public.friendships for each row execute function public.tafa_v74_friend_reward();

-- Admin can request a payout at any time once the 1,000 Ar minimum is reached.
create or replace function public.tafa_admin_request_platform_withdrawal_v74(p_amount_mga numeric,p_payout_method_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare aid uuid; wid uuid; begin
  aid:=auth.uid(); if aid is null or not public.tafa_v74_is_admin(aid) then raise exception 'Accès administrateur requis'; end if;
  if p_amount_mga<1000 then raise exception 'Minimum de retrait : 1 000 Ar'; end if;
  if not exists(select 1 from public.tafab_creator_payout_methods where id=p_payout_method_id and user_id=aid and status='active') then raise exception 'Moyen de retrait actif introuvable'; end if;
  update public.tafa_platform_wallets_v74 set earnings_mga=earnings_mga-p_amount_mga,total_withdrawn_mga=total_withdrawn_mga+p_amount_mga,updated_at=now() where user_id=aid and earnings_mga>=p_amount_mga returning id into wid;
  if wid is null then raise exception 'Solde disponible insuffisant'; end if;
  insert into public.tafa_admin_withdrawals_v74(admin_user_id,amount_mga,payout_method_id) values(aid,p_amount_mga,p_payout_method_id) returning id into wid;
  return wid;
end; $$;

create or replace function public.tafa_admin_platform_wallet_v74()
returns jsonb language plpgsql security definer set search_path=public as $$
declare aid uuid; w jsonb; begin
  aid:=auth.uid(); if aid is null or not public.tafa_v74_is_admin(aid) then raise exception 'Accès administrateur requis'; end if;
  select to_jsonb(x) into w from public.tafa_platform_wallets_v74 x where x.user_id=aid;
  return coalesce(w,'{}'::jsonb);
end; $$;

-- Helpful realtime publication for the new server ledger/wallet.
do $$ begin
  begin alter publication supabase_realtime add table public.tafa_platform_wallets_v74; exception when duplicate_object then null; when undefined_object then null; end;
  begin alter publication supabase_realtime add table public.tafa_platform_coin_ledger_v74; exception when duplicate_object then null; when undefined_object then null; end;
  begin alter publication supabase_realtime add table public.tafa_admin_withdrawals_v74; exception when duplicate_object then null; when undefined_object then null; end;
end $$;

-- Backfill wallet/referral rows for accounts already present.
insert into public.tafa_platform_wallets_v74(user_id,referral_code)
select p.id,public.tafa_v74_referral_code(p.id) from public.profiles p
on conflict(user_id) do update set referral_code=coalesce(public.tafa_platform_wallets_v74.referral_code,excluded.referral_code);

