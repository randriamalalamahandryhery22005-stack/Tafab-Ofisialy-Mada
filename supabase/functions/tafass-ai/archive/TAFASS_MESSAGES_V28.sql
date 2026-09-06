-- ============================================================
-- TAFAß V28 — Shared conversation theme + shared aliases
-- + first-contact greeting support (UI only for greetings)
-- ============================================================

create table if not exists public.tafab_shared_message_themes (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  theme text not null default 'default' check(theme in ('default','amoureux','triste','heureux','enemies','nature','ocean','nuit')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.tafab_shared_message_themes enable row level security;
drop policy if exists tsmst_select on public.tafab_shared_message_themes;
drop policy if exists tsmst_insert on public.tafab_shared_message_themes;
drop policy if exists tsmst_update on public.tafab_shared_message_themes;
drop policy if exists tsmst_delete on public.tafab_shared_message_themes;
create policy tsmst_select on public.tafab_shared_message_themes for select to authenticated
using (exists(select 1 from public.conversation_members cm where cm.conversation_id=tafab_shared_message_themes.conversation_id and cm.user_id=auth.uid()));
create policy tsmst_insert on public.tafab_shared_message_themes for insert to authenticated
with check (exists(select 1 from public.conversation_members cm where cm.conversation_id=tafab_shared_message_themes.conversation_id and cm.user_id=auth.uid()) and updated_by=auth.uid());
create policy tsmst_update on public.tafab_shared_message_themes for update to authenticated
using (exists(select 1 from public.conversation_members cm where cm.conversation_id=tafab_shared_message_themes.conversation_id and cm.user_id=auth.uid()))
with check (exists(select 1 from public.conversation_members cm where cm.conversation_id=tafab_shared_message_themes.conversation_id and cm.user_id=auth.uid()) and updated_by=auth.uid());
create policy tsmst_delete on public.tafab_shared_message_themes for delete to authenticated
using (exists(select 1 from public.conversation_members cm where cm.conversation_id=tafab_shared_message_themes.conversation_id and cm.user_id=auth.uid()));


create table if not exists public.tafab_conversation_aliases (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(conversation_id,target_user_id)
);

alter table public.tafab_conversation_aliases enable row level security;
drop policy if exists tca_select on public.tafab_conversation_aliases;
drop policy if exists tca_insert on public.tafab_conversation_aliases;
drop policy if exists tca_update on public.tafab_conversation_aliases;
drop policy if exists tca_delete on public.tafab_conversation_aliases;
create policy tca_select on public.tafab_conversation_aliases for select to authenticated
using (exists(select 1 from public.conversation_members cm where cm.conversation_id=tafab_conversation_aliases.conversation_id and cm.user_id=auth.uid()));
create policy tca_insert on public.tafab_conversation_aliases for insert to authenticated
with check (exists(select 1 from public.conversation_members cm where cm.conversation_id=tafab_conversation_aliases.conversation_id and cm.user_id=auth.uid()) and updated_by=auth.uid() and exists(select 1 from public.conversation_members cm2 where cm2.conversation_id=tafab_conversation_aliases.conversation_id and cm2.user_id=target_user_id));
create policy tca_update on public.tafab_conversation_aliases for update to authenticated
using (exists(select 1 from public.conversation_members cm where cm.conversation_id=tafab_conversation_aliases.conversation_id and cm.user_id=auth.uid()))
with check (exists(select 1 from public.conversation_members cm where cm.conversation_id=tafab_conversation_aliases.conversation_id and cm.user_id=auth.uid()) and updated_by=auth.uid());
create policy tca_delete on public.tafab_conversation_aliases for delete to authenticated
using (exists(select 1 from public.conversation_members cm where cm.conversation_id=tafab_conversation_aliases.conversation_id and cm.user_id=auth.uid()));

-- Realtime for both shared settings tables.
do $$ begin
  if to_regclass('public.tafab_shared_message_themes') is not null then
    alter table public.tafab_shared_message_themes replica identity full;
    begin alter publication supabase_realtime add table public.tafab_shared_message_themes; exception when duplicate_object then null; end;
  end if;
  if to_regclass('public.tafab_conversation_aliases') is not null then
    alter table public.tafab_conversation_aliases replica identity full;
    begin alter publication supabase_realtime add table public.tafab_conversation_aliases; exception when duplicate_object then null; end;
  end if;
end $$;

grant select, insert, update, delete on public.tafab_shared_message_themes to authenticated;
grant select, insert, update, delete on public.tafab_conversation_aliases to authenticated;
