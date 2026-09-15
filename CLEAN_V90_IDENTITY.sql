-- TAFAß V90 CLEAN IDENTITY
-- Repairs only profile display identity. No monetisation, music or referral logic is added.
-- Valid first/last names are preserved. Email addresses are never used as display names.

create or replace function public.tafass_clean_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb;
  fn text;
  ln text;
begin
  select coalesce(raw_user_meta_data,'{}'::jsonb)
    into meta
  from auth.users
  where id = new.id;

  fn := nullif(trim(meta->>'first_name'),'');
  ln := nullif(trim(meta->>'last_name'),'');

  if (new.first_name is null or trim(new.first_name) = '' or position('@' in new.first_name) > 0)
     and fn is not null then
    new.first_name := fn;
  end if;

  if (new.last_name is null or trim(new.last_name) = '' or position('@' in new.last_name) > 0)
     and ln is not null then
    new.last_name := ln;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tafass_clean_profile_identity on public.profiles;
create trigger trg_tafass_clean_profile_identity
before insert or update of first_name,last_name on public.profiles
for each row execute function public.tafass_clean_profile_identity();

-- Repair existing profiles whose name fields accidentally contain an email.
update public.profiles p
set first_name = coalesce(nullif(trim(u.raw_user_meta_data->>'first_name'),''), p.first_name),
    last_name  = coalesce(nullif(trim(u.raw_user_meta_data->>'last_name'),''), p.last_name),
    updated_at = now()
from auth.users u
where u.id = p.id
  and (
    position('@' in coalesce(p.first_name,'')) > 0
    or position('@' in coalesce(p.last_name,'')) > 0
  );

-- Do not copy email into first_name/last_name when metadata is missing.
-- Such accounts remain labelled "Membre Tafaß" by the UI until a real name is supplied.
