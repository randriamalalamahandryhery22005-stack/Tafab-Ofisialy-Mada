-- TAFAß V24 — Creator Monetisation + Live 2.0
-- Safe additive migration. No existing application data is deleted.
create extension if not exists pgcrypto;

create table if not exists public.tafab_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coins bigint not null default 0 check (coins >= 0),
  earnings_mga bigint not null default 0 check (earnings_mga >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.tafab_coin_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null,
  kind text not null check (kind in ('purchase','gift_sent','gift_received','refund','adjustment')),
  reference_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.tafab_live_gifts (
  id uuid primary key default gen_random_uuid(),
  live_session_id uuid not null references public.live_sessions(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  gift_type text not null default 'heart',
  coins bigint not null check (coins > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.tafab_creator_subscriptions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  subscriber_id uuid not null references auth.users(id) on delete cascade,
  monthly_price_mga bigint not null default 2500 check (monthly_price_mga > 0),
  status text not null default 'active' check (status in ('active','cancelled','expired')),
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (creator_id, subscriber_id)
);

create table if not exists public.tafab_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_mga bigint not null check (amount_mga >= 1000),
  method text not null default 'mobile_money',
  destination_hint text,
  status text not null default 'pending' check (status in ('pending','approved','paid','rejected')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists tafab_coin_ledger_user_created_idx on public.tafab_coin_ledger(user_id,created_at desc);
create index if not exists tafab_live_gifts_session_created_idx on public.tafab_live_gifts(live_session_id,created_at desc);
create index if not exists tafab_creator_subscriptions_creator_idx on public.tafab_creator_subscriptions(creator_id,status);
create index if not exists tafab_withdrawals_user_created_idx on public.tafab_withdrawal_requests(user_id,created_at desc);

alter table public.tafab_wallets enable row level security;
alter table public.tafab_coin_ledger enable row level security;
alter table public.tafab_live_gifts enable row level security;
alter table public.tafab_creator_subscriptions enable row level security;
alter table public.tafab_withdrawal_requests enable row level security;

drop policy if exists tafab_wallets_select on public.tafab_wallets;
create policy tafab_wallets_select on public.tafab_wallets for select to authenticated using(user_id=auth.uid());
drop policy if exists tafab_wallets_insert on public.tafab_wallets;
create policy tafab_wallets_insert on public.tafab_wallets for insert to authenticated with check(user_id=auth.uid());
-- Wallet balances must not be client-editable.
drop policy if exists tafab_wallets_update on public.tafab_wallets;
drop policy if exists tafab_wallets_delete on public.tafab_wallets;

drop policy if exists tafab_coin_ledger_select on public.tafab_coin_ledger;
create policy tafab_coin_ledger_select on public.tafab_coin_ledger for select to authenticated using(user_id=auth.uid());
drop policy if exists tafab_coin_ledger_insert on public.tafab_coin_ledger;

drop policy if exists tafab_live_gifts_select on public.tafab_live_gifts;
create policy tafab_live_gifts_select on public.tafab_live_gifts for select to authenticated using(sender_id=auth.uid() or receiver_id=auth.uid());
drop policy if exists tafab_live_gifts_insert on public.tafab_live_gifts;

drop policy if exists tafab_creator_subscriptions_select on public.tafab_creator_subscriptions;
create policy tafab_creator_subscriptions_select on public.tafab_creator_subscriptions for select to authenticated using(subscriber_id=auth.uid() or creator_id=auth.uid());
drop policy if exists tafab_creator_subscriptions_insert on public.tafab_creator_subscriptions;
create policy tafab_creator_subscriptions_insert on public.tafab_creator_subscriptions for insert to authenticated with check(subscriber_id=auth.uid() and creator_id<>auth.uid());

drop policy if exists tafab_withdrawals_select on public.tafab_withdrawal_requests;
create policy tafab_withdrawals_select on public.tafab_withdrawal_requests for select to authenticated using(user_id=auth.uid());
drop policy if exists tafab_withdrawals_insert on public.tafab_withdrawal_requests;
create policy tafab_withdrawals_insert on public.tafab_withdrawal_requests for insert to authenticated with check(user_id=auth.uid() and status='pending');

-- Server-side gift transaction: atomically verifies balance and transfers coins.
create or replace function public.tafab_send_live_gift(
  p_live_session_id uuid,
  p_receiver_id uuid,
  p_gift_type text,
  p_coins bigint
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  uid uuid := auth.uid();
  sender_balance bigint;
  session_owner uuid;
  gift_id uuid;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_coins is null or p_coins <= 0 or p_coins > 100000 then raise exception 'Invalid coin amount'; end if;
  select user_id into session_owner from public.live_sessions where id=p_live_session_id and status='live';
  if session_owner is null then raise exception 'Live unavailable'; end if;
  if session_owner = uid then raise exception 'Cannot gift yourself'; end if;
  if p_receiver_id <> session_owner then raise exception 'Invalid receiver'; end if;

  insert into public.tafab_wallets(user_id) values(uid) on conflict(user_id) do nothing;
  insert into public.tafab_wallets(user_id) values(session_owner) on conflict(user_id) do nothing;
  select coins into sender_balance from public.tafab_wallets where user_id=uid for update;
  if sender_balance < p_coins then raise exception 'Insufficient coins'; end if;

  update public.tafab_wallets set coins=coins-p_coins,updated_at=now() where user_id=uid;
  update public.tafab_wallets set coins=coins+p_coins,earnings_mga=earnings_mga+floor(p_coins/10),updated_at=now() where user_id=session_owner;
  insert into public.tafab_coin_ledger(user_id,amount,kind,note) values(uid,-p_coins,'gift_sent',p_gift_type);
  insert into public.tafab_coin_ledger(user_id,amount,kind,note) values(session_owner,p_coins,'gift_received',p_gift_type);
  insert into public.tafab_live_gifts(live_session_id,sender_id,receiver_id,gift_type,coins) values(p_live_session_id,uid,session_owner,coalesce(nullif(p_gift_type,''),'heart'),p_coins) returning id into gift_id;
  return jsonb_build_object('ok',true,'gift_id',gift_id,'remaining_coins',sender_balance-p_coins);
end;
$$;
revoke all on function public.tafab_send_live_gift(uuid,uuid,text,bigint) from public;
grant execute on function public.tafab_send_live_gift(uuid,uuid,text,bigint) to authenticated;

-- Realtime additions (safe if already present).
do $$ begin
  if to_regclass('public.tafab_live_gifts') is not null then
    begin alter publication supabase_realtime add table public.tafab_live_gifts; exception when duplicate_object then null; end;
  end if;
  if to_regclass('public.tafab_creator_subscriptions') is not null then
    begin alter publication supabase_realtime add table public.tafab_creator_subscriptions; exception when duplicate_object then null; end;
  end if;
end $$;

select 'TAFAß V24 CREATOR MONETISATION + LIVE 2.0 READY' as status;
