-- Tafaß V8.1 — Messages premium: modification timestamp
-- Safe to run repeatedly.
alter table if exists public.messages
  add column if not exists updated_at timestamptz;

create index if not exists idx_messages_conversation_created_at
  on public.messages(conversation_id, created_at desc);

create index if not exists idx_messages_sender_id
  on public.messages(sender_id);
