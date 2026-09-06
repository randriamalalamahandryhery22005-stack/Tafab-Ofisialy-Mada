-- TAFAß V36.1 — Message invitations (additive only)
create table if not exists public.tafab_message_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(sender_id<>receiver_id)
);
create unique index if not exists tmrq_pending_unique on public.tafab_message_requests(sender_id,receiver_id) where status='pending';
create index if not exists tmrq_receiver_idx on public.tafab_message_requests(receiver_id,status,created_at desc);
create index if not exists tmrq_sender_idx on public.tafab_message_requests(sender_id,status,created_at desc);
alter table public.tafab_message_requests enable row level security;
drop policy if exists tmrq_select on public.tafab_message_requests;
drop policy if exists tmrq_insert on public.tafab_message_requests;
drop policy if exists tmrq_update on public.tafab_message_requests;
create policy tmrq_select on public.tafab_message_requests for select to authenticated using(sender_id=auth.uid() or receiver_id=auth.uid());
create policy tmrq_insert on public.tafab_message_requests for insert to authenticated with check(sender_id=auth.uid());
create policy tmrq_update on public.tafab_message_requests for update to authenticated using(receiver_id=auth.uid() or sender_id=auth.uid()) with check(receiver_id=auth.uid() or sender_id=auth.uid());
do $$ begin
  alter table public.tafab_message_requests replica identity full;
  alter publication supabase_realtime add table public.tafab_message_requests;
exception when duplicate_object then null; when others then null; end $$;
