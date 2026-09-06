/* =========================================================
   TAFAß — ADMIN TOTAL
   Compte cible: herymahandry04@gmail.com
   Safe to re-run. No user/content data is deleted.
   À exécuter dans Supabase SQL Editor avec les droits postgres.
   ========================================================= */

create table if not exists public.tafa_admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('super_admin','admin','moderator')),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null
);

create index if not exists tafa_admin_roles_role_idx
  on public.tafa_admin_roles(role);

grant usage on schema public to authenticated;
grant select on public.tafa_admin_roles to authenticated;

alter table public.tafa_admin_roles enable row level security;

drop policy if exists tafa_admin_roles_self_read on public.tafa_admin_roles;
create policy tafa_admin_roles_self_read
on public.tafa_admin_roles
for select
using (user_id = auth.uid());

create or replace function public.tafa_is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tafa_admin_roles r
    where r.user_id = p_user_id
      and r.role in ('super_admin','admin')
  );
$$;

grant execute on function public.tafa_is_admin(uuid) to authenticated;

-- Accorde l'administration totale au compte demandé.
-- auth.users est utilisé uniquement ici côté serveur/Supabase SQL Editor.
do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from auth.users
  where lower(email) = lower('herymahandry04@gmail.com')
  limit 1;

  if v_user_id is null then
    raise exception 'Compte introuvable: herymahandry04@gmail.com';
  end if;

  insert into public.tafa_admin_roles (user_id, role, granted_at)
  values (v_user_id, 'super_admin', now())
  on conflict (user_id) do update
    set role = 'super_admin', granted_at = now();
end $$;

-- Vérification finale: doit retourner 1 ligne avec super_admin.
select r.user_id, r.role, u.email
from public.tafa_admin_roles r
join auth.users u on u.id = r.user_id
where lower(u.email) = lower('herymahandry04@gmail.com');
