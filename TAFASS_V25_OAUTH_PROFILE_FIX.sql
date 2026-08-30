/*
  Tafaß V25 — OAuth onboarding + profile completion fix
  Run once in Supabase SQL Editor.
  No existing posts/messages/friends data are deleted.
*/

alter table public.profiles add column if not exists city_current text;
alter table public.profiles add column if not exists city_origin text;
alter table public.profiles add column if not exists name_changed_at timestamptz;

create or replace function public.tafa_complete_oauth_profile(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_birth date,
  p_gender text,
  p_phone text,
  p_country text,
  p_city_current text,
  p_city_origin text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  result public.profiles;
  auth_email text;
begin
  if uid is null then
    raise exception 'TAFAß_AUTH_REQUIRED: Session Supabase invalide.';
  end if;

  auth_email := nullif(auth.jwt()->>'email','');
  if auth_email is null then
    auth_email := nullif(trim(p_email),'');
  end if;

  if coalesce(trim(p_first_name),'') = ''
     or coalesce(trim(p_last_name),'') = ''
     or p_birth is null
     or coalesce(trim(p_gender),'') = ''
     or coalesce(trim(p_phone),'') = ''
     or coalesce(trim(p_country),'') = ''
     or coalesce(trim(p_city_current),'') = ''
     or coalesce(trim(p_city_origin),'') = '' then
    raise exception 'TAFAß_PROFILE_INCOMPLETE: Toutes les informations obligatoires sont requises.';
  end if;

  if p_birth > current_date then
    raise exception 'TAFAß_INVALID_BIRTH: Date de naissance invalide.';
  end if;

  if extract(year from age(current_date, p_birth)) < 13 then
    raise exception 'TAFAß_AGE_REQUIRED: Vous devez avoir au moins 13 ans.';
  end if;

  insert into public.profiles (
    id, first_name, last_name, email, birth, gender, phone,
    country, city_current, city_origin, updated_at
  ) values (
    uid, trim(p_first_name), trim(p_last_name), auth_email, p_birth, trim(p_gender),
    trim(p_phone), trim(p_country), trim(p_city_current), trim(p_city_origin), now()
  )
  on conflict (id) do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    email = excluded.email,
    birth = excluded.birth,
    gender = excluded.gender,
    phone = excluded.phone,
    country = excluded.country,
    city_current = excluded.city_current,
    city_origin = excluded.city_origin,
    updated_at = now()
  returning * into result;

  return result;
end;
$$;

revoke all on function public.tafa_complete_oauth_profile(text,text,text,date,text,text,text,text,text) from public;
grant execute on function public.tafa_complete_oauth_profile(text,text,text,date,text,text,text,text,text) to authenticated;

-- Synchronize profile emails with the authenticated Supabase account.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and u.email is not null
  and p.email is distinct from u.email;
