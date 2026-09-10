-- ============================================================
-- Tafaß V70 — Conversation themes, synchronized on both accounts
-- Idempotent. Requires Supabase Auth + public.conversations +
-- public.conversation_members to already exist.
-- ============================================================

create table if not exists public.tafa_message_themes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  theme_key text not null default 'emerald',
  updated_at timestamptz not null default now(),
  unique (user_id, conversation_id),
  constraint tafa_message_themes_key_check
    check (theme_key in ('emerald','sunset','gold','forest','rose','midnight'))
);

alter table public.tafa_message_themes enable row level security;

revoke all on public.tafa_message_themes from anon;
grant select, insert, update, delete on public.tafa_message_themes to authenticated;

drop policy if exists tafa_message_themes_select on public.tafa_message_themes;
create policy tafa_message_themes_select
on public.tafa_message_themes
for select to authenticated
using (user_id = auth.uid());

drop policy if exists tafa_message_themes_insert on public.tafa_message_themes;
create policy tafa_message_themes_insert
on public.tafa_message_themes
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists tafa_message_themes_update on public.tafa_message_themes;
create policy tafa_message_themes_update
on public.tafa_message_themes
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists tafa_message_themes_delete on public.tafa_message_themes;
create policy tafa_message_themes_delete
on public.tafa_message_themes
for delete to authenticated
using (user_id = auth.uid());

create or replace function public.tafa_set_conversation_theme(
  p_conversation_id uuid,
  p_theme_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  member_count integer;
begin
  if uid is null then
    raise exception 'Session utilisateur requise.';
  end if;

  if p_theme_key not in ('emerald','sunset','gold','forest','rose','midnight') then
    raise exception 'Thème invalide.';
  end if;

  select count(*) into member_count
  from public.conversation_members
  where conversation_id = p_conversation_id;

  if member_count < 1 then
    raise exception 'Conversation introuvable.';
  end if;

  if not exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = uid
  ) then
    raise exception 'Vous ne faites pas partie de cette conversation.';
  end if;

  insert into public.tafa_message_themes (conversation_id, user_id, theme_key, updated_at)
  select p_conversation_id, cm.user_id, p_theme_key, now()
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
  on conflict (user_id, conversation_id)
  do update set theme_key = excluded.theme_key, updated_at = now();

  return jsonb_build_object('ok', true, 'conversation_id', p_conversation_id, 'theme_key', p_theme_key);
end;
$$;

grant execute on function public.tafa_set_conversation_theme(uuid,text) to authenticated;

alter table public.tafa_message_themes replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tafa_message_themes'
  ) then
    alter publication supabase_realtime add table public.tafa_message_themes;
  end if;
exception when duplicate_object then
  null;
end $$;

select 'TAFAß_V70_THEME_OK' as status;
