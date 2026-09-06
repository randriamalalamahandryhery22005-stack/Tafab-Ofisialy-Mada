-- Tafaß V27 — Messages 2.0 complete
-- Additive only: no existing table/data is deleted.
create table if not exists public.tafab_message_hidden (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,message_id)
);
create table if not exists public.tafab_message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (char_length(reaction) between 1 and 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(message_id,user_id)
);
create table if not exists public.tafab_deleted_conversations (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,conversation_id)
);
create table if not exists public.tafab_message_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id),
  check(blocker_id<>blocked_id)
);

alter table public.tafab_message_hidden enable row level security;
alter table public.tafab_message_reactions enable row level security;
alter table public.tafab_deleted_conversations enable row level security;
alter table public.tafab_message_blocks enable row level security;

drop policy if exists tmh_select on public.tafab_message_hidden;
drop policy if exists tmh_insert on public.tafab_message_hidden;
drop policy if exists tmh_delete on public.tafab_message_hidden;
create policy tmh_select on public.tafab_message_hidden for select to authenticated using(user_id=auth.uid());
create policy tmh_insert on public.tafab_message_hidden for insert to authenticated with check(user_id=auth.uid());
create policy tmh_delete on public.tafab_message_hidden for delete to authenticated using(user_id=auth.uid());

drop policy if exists tmr_select on public.tafab_message_reactions;
drop policy if exists tmr_insert on public.tafab_message_reactions;
drop policy if exists tmr_update on public.tafab_message_reactions;
drop policy if exists tmr_delete on public.tafab_message_reactions;
create policy tmr_select on public.tafab_message_reactions for select to authenticated using(true);
create policy tmr_insert on public.tafab_message_reactions for insert to authenticated with check(user_id=auth.uid());
create policy tmr_update on public.tafab_message_reactions for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy tmr_delete on public.tafab_message_reactions for delete to authenticated using(user_id=auth.uid());

drop policy if exists tdc_select on public.tafab_deleted_conversations;
drop policy if exists tdc_insert on public.tafab_deleted_conversations;
drop policy if exists tdc_delete on public.tafab_deleted_conversations;
create policy tdc_select on public.tafab_deleted_conversations for select to authenticated using(user_id=auth.uid());
create policy tdc_insert on public.tafab_deleted_conversations for insert to authenticated with check(user_id=auth.uid());
create policy tdc_delete on public.tafab_deleted_conversations for delete to authenticated using(user_id=auth.uid());

drop policy if exists tmb_select on public.tafab_message_blocks;
drop policy if exists tmb_insert on public.tafab_message_blocks;
drop policy if exists tmb_delete on public.tafab_message_blocks;
create policy tmb_select on public.tafab_message_blocks for select to authenticated using(blocker_id=auth.uid() or blocked_id=auth.uid());
create policy tmb_insert on public.tafab_message_blocks for insert to authenticated with check(blocker_id=auth.uid() and blocker_id<>blocked_id);
create policy tmb_delete on public.tafab_message_blocks for delete to authenticated using(blocker_id=auth.uid());

create index if not exists tmh_user_idx on public.tafab_message_hidden(user_id,created_at desc);
create index if not exists tmr_message_idx on public.tafab_message_reactions(message_id,created_at desc);
create index if not exists tdc_user_idx on public.tafab_deleted_conversations(user_id,created_at desc);
create index if not exists tmb_blocker_idx on public.tafab_message_blocks(blocker_id,created_at desc);
create index if not exists tmb_blocked_idx on public.tafab_message_blocks(blocked_id,created_at desc);

-- Realtime for message reactions.
do $$ begin
  alter table public.tafab_message_reactions replica identity full;
  alter table public.tafab_message_blocks replica identity full;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.tafab_message_reactions;
exception when duplicate_object then null; when others then null; end $$;


-- V27.1: definitive delete-for-everyone RPC.
-- SECURITY DEFINER is used because normal client DELETE may be restricted by the base messages RLS.
create or replace function public.tafab_delete_message_for_everyone(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.messages
  where id = p_message_id
    and sender_id = auth.uid();

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'Message introuvable ou suppression non autorisée';
  end if;
  return true;
end;
$$;

revoke all on function public.tafab_delete_message_for_everyone(uuid) from public;
grant execute on function public.tafab_delete_message_for_everyone(uuid) to authenticated;


-- V27.2: soft delete marker + edit history + per-user conversation themes.
alter table public.messages add column if not exists deleted_for_everyone boolean not null default false;
alter table public.messages add column if not exists deleted_at timestamptz;
alter table public.messages add column if not exists deleted_by uuid references auth.users(id) on delete set null;
create index if not exists messages_deleted_idx on public.messages(conversation_id,deleted_for_everyone,created_at);

create table if not exists public.tafab_message_edits (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  editor_id uuid not null references auth.users(id) on delete cascade,
  old_content text not null default '',
  edited_at timestamptz not null default now()
);
alter table public.tafab_message_edits enable row level security;
drop policy if exists tme_select on public.tafab_message_edits;
drop policy if exists tme_insert on public.tafab_message_edits;
create policy tme_select on public.tafab_message_edits for select to authenticated using (
  editor_id=auth.uid() or exists (
    select 1 from public.messages m join public.conversation_members cm on cm.conversation_id=m.conversation_id
    where m.id=tafab_message_edits.message_id and cm.user_id=auth.uid()
  )
);
create policy tme_insert on public.tafab_message_edits for insert to authenticated with check(editor_id=auth.uid());
create index if not exists tme_message_idx on public.tafab_message_edits(message_id,edited_at desc);

create or replace function public.tafab_edit_message(p_message_id uuid,p_new_content text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_old text; v_sender uuid;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 select content,sender_id into v_old,v_sender from public.messages where id=p_message_id for update;
 if v_sender is null or v_sender<>auth.uid() then raise exception 'Message introuvable ou modification non autorisée'; end if;
 if coalesce(trim(p_new_content),'')='' then raise exception 'Le message ne peut pas être vide'; end if;
 insert into public.tafab_message_edits(message_id,editor_id,old_content) values(p_message_id,auth.uid(),coalesce(v_old,''));
 update public.messages set content=trim(p_new_content),updated_at=now() where id=p_message_id and sender_id=auth.uid() and not deleted_for_everyone;
 return true;
end; $$;
revoke all on function public.tafab_edit_message(uuid,text) from public;
grant execute on function public.tafab_edit_message(uuid,text) to authenticated;

create or replace function public.tafab_delete_message_for_everyone(p_message_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_sender uuid; v_conv uuid;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 select sender_id,conversation_id into v_sender,v_conv from public.messages where id=p_message_id for update;
 if v_sender is null or v_sender<>auth.uid() then raise exception 'Message introuvable ou suppression non autorisée'; end if;
 update public.messages
 set content='',media_url=null,media_type=null,deleted_for_everyone=true,deleted_at=now(),deleted_by=auth.uid(),updated_at=now()
 where id=p_message_id and sender_id=auth.uid();
 delete from public.tafab_message_reactions where message_id=p_message_id;
 return true;
end; $$;
revoke all on function public.tafab_delete_message_for_everyone(uuid) from public;
grant execute on function public.tafab_delete_message_for_everyone(uuid) to authenticated;

create table if not exists public.tafab_message_themes (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  theme text not null default 'default' check(theme in ('default','amoureux','triste','heureux','enemies','nature','ocean','nuit')),
  updated_at timestamptz not null default now(),
  primary key(user_id,conversation_id)
);
alter table public.tafab_message_themes enable row level security;
drop policy if exists tmt_select on public.tafab_message_themes;
drop policy if exists tmt_insert on public.tafab_message_themes;
drop policy if exists tmt_update on public.tafab_message_themes;
drop policy if exists tmt_delete on public.tafab_message_themes;
create policy tmt_select on public.tafab_message_themes for select to authenticated using(user_id=auth.uid());
create policy tmt_insert on public.tafab_message_themes for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.conversation_members cm where cm.conversation_id=tafab_message_themes.conversation_id and cm.user_id=auth.uid()));
create policy tmt_update on public.tafab_message_themes for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy tmt_delete on public.tafab_message_themes for delete to authenticated using(user_id=auth.uid());
create index if not exists tmt_conv_idx on public.tafab_message_themes(conversation_id,user_id);
