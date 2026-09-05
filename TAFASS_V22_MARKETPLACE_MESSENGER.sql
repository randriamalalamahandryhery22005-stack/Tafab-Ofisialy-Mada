-- Tafaß V22 — Marketplace 2.0 + Messenger 2.0
-- Safe to run repeatedly. Existing data is preserved.

create table if not exists public.tafab_favorites (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.tafab_listings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(listing_id,user_id)
);

create table if not exists public.tafab_orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','confirmed','preparing','shipped','delivered','cancelled')),
  total_amount numeric(14,2),
  currency text not null default 'MGA',
  note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tafab_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.tafab_orders(id) on delete cascade,
  listing_id uuid not null references public.tafab_listings(id) on delete restrict,
  quantity integer not null default 1 check(quantity > 0),
  unit_price numeric(14,2),
  created_at timestamptz not null default now()
);

alter table public.tafab_favorites enable row level security;
alter table public.tafab_orders enable row level security;
alter table public.tafab_order_items enable row level security;

drop policy if exists tafab_favorites_select on public.tafab_favorites;
drop policy if exists tafab_favorites_insert on public.tafab_favorites;
drop policy if exists tafab_favorites_delete on public.tafab_favorites;
create policy tafab_favorites_select on public.tafab_favorites for select to authenticated using(user_id=auth.uid());
create policy tafab_favorites_insert on public.tafab_favorites for insert to authenticated with check(user_id=auth.uid());
create policy tafab_favorites_delete on public.tafab_favorites for delete to authenticated using(user_id=auth.uid());

drop policy if exists tafab_orders_select on public.tafab_orders;
drop policy if exists tafab_orders_insert on public.tafab_orders;
drop policy if exists tafab_orders_update on public.tafab_orders;
create policy tafab_orders_select on public.tafab_orders for select to authenticated using(buyer_id=auth.uid() or seller_id=auth.uid());
create policy tafab_orders_insert on public.tafab_orders for insert to authenticated with check(buyer_id=auth.uid());
create policy tafab_orders_update on public.tafab_orders for update to authenticated using(seller_id=auth.uid() or buyer_id=auth.uid());

drop policy if exists tafab_order_items_select on public.tafab_order_items;
drop policy if exists tafab_order_items_insert on public.tafab_order_items;
create policy tafab_order_items_select on public.tafab_order_items for select to authenticated using(exists(select 1 from public.tafab_orders o where o.id=order_id and (o.buyer_id=auth.uid() or o.seller_id=auth.uid())));
create policy tafab_order_items_insert on public.tafab_order_items for insert to authenticated with check(exists(select 1 from public.tafab_orders o where o.id=order_id and o.buyer_id=auth.uid()));

create index if not exists tafab_favorites_user_idx on public.tafab_favorites(user_id,created_at desc);
create index if not exists tafab_orders_buyer_idx on public.tafab_orders(buyer_id,created_at desc);
create index if not exists tafab_orders_seller_idx on public.tafab_orders(seller_id,created_at desc);
create index if not exists tafab_order_items_order_idx on public.tafab_order_items(order_id);

alter table public.tafab_favorites replica identity full;
alter table public.tafab_orders replica identity full;
alter table public.tafab_order_items replica identity full;
do $$
declare t text;
begin
  foreach t in array array['tafab_favorites','tafab_orders','tafab_order_items'] loop
    begin execute format('alter publication supabase_realtime add table public.%I',t); exception when duplicate_object then null; end;
  end loop;
end $$;

-- Messenger 2.0 compatibility: attachments are already supported by messages.media_url/media_type.
-- reply_to_id is added by the existing V15 migration when needed.
alter table public.messages add column if not exists media_url text;
alter table public.messages add column if not exists media_type text;
