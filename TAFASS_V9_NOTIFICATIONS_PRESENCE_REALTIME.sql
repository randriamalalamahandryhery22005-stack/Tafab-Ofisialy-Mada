-- TAFAß V9 — Notifications & Presence Realtime
-- Safe/idempotent migration. Presence is handled by Supabase Realtime Presence and is NOT stored in SQL.

-- Ensure notification reads are fast.
create index if not exists notifications_user_unread_created_idx
on public.notifications (user_id, is_read, created_at desc);

-- Ensure message unread counts are fast.
create index if not exists messages_conversation_unread_idx
on public.messages (conversation_id, is_read, created_at desc);

-- The client uses existing RLS and the existing tafa_mark_conversation_read RPC.
-- No policy is weakened by this migration.
