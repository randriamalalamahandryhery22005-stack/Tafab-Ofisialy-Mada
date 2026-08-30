-- Tafaß V30 - payment request storage.
-- This creates REAL database-backed payment requests; it does not pretend that a
-- mobile-money transfer succeeded. A real provider/API must validate and settle it.
create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  method text not null check (method in ('Airtel Money','Yas Money')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'MGA',
  status text not null default 'pending' check (status in ('pending','paid','failed','cancelled')),
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_transactions_user_created_idx on public.payment_transactions(user_id, created_at desc);
create unique index if not exists payment_transactions_one_pending_idx
  on public.payment_transactions(user_id, method, amount)
  where status='pending';
alter table public.payment_transactions enable row level security;
drop policy if exists "payment_transactions_select_own" on public.payment_transactions;
drop policy if exists "payment_transactions_insert_own" on public.payment_transactions;
create policy "payment_transactions_select_own" on public.payment_transactions for select to authenticated using (auth.uid()=user_id);
create policy "payment_transactions_insert_own" on public.payment_transactions for insert to authenticated with check (auth.uid()=user_id);
