/* Tafaß — STABLE SETUP / MIGRATION
   Run once after the base project SQL. Safe to re-run.
   No user content is deleted.
*/

create extension if not exists pgcrypto;

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.profiles to authenticated;

grant select on public.profiles to anon;

alter table public.profiles add column if not exists city_current text;
alter table public.profiles add column if not exists city_origin text;
alter table public.profiles add column if not exists name_changed_at timestamptz;

create or replace function public.tafa_profiles_identity_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_email text;
begin
  auth_email := nullif(auth.jwt()->>'email','');
  if auth_email is not null then new.email := auth_email; end if;

  if tg_op = 'UPDATE' and (new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name) then
    if old.name_changed_at is not null and old.name_changed_at > now() - interval '15 days' then
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
for each row execute function public.tafa_profiles_identity_guard();

alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Keep profile e-mail synchronized with auth.users.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and u.email is not null and p.email is distinct from u.email;
