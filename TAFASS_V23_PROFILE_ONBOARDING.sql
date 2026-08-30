/*
  Tafaß V22 — Profile identity sync + 15-day name-change rule
  Run this once in Supabase SQL Editor.
  No existing profile/post/message data is deleted.
*/

alter table public.profiles
  add column if not exists name_changed_at timestamptz;

create or replace function public.tafa_profiles_identity_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_email text;
begin
  -- Keep profile email aligned with the authenticated Supabase account.
  auth_email := nullif(auth.jwt()->>'email', '');
  if auth_email is not null then
    new.email := auth_email;
  end if;

  -- A first name/last name change is allowed only once per 15 days.
  if TG_OP = 'UPDATE'
     and (
       new.first_name is distinct from old.first_name
       or new.last_name is distinct from old.last_name
     )
  then
    if old.name_changed_at is not null
       and old.name_changed_at > now() - interval '15 days'
    then
      raise exception 'TAFAß_NAME_CHANGE_COOLDOWN: Vous pourrez modifier votre nom/prénom 15 jours après la dernière modification.';
    end if;
    new.name_changed_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tafa_profiles_identity_guard on public.profiles;

create trigger tafa_profiles_identity_guard
before update on public.profiles
for each row
execute function public.tafa_profiles_identity_guard();

-- Synchronise les emails déjà enregistrés avec auth.users.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and u.email is not null
  and p.email is distinct from u.email;


-- V23 profile public location fields
alter table public.profiles add column if not exists city_current text;
alter table public.profiles add column if not exists city_origin text;

-- Keep the authenticated email as source of truth for future profile updates.
