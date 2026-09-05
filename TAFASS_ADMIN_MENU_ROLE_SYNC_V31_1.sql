/* TAFAß V31.1 — ADMIN MENU ROLE SYNC
   Run after the existing Admin SQL migrations.
   The authoritative source for admin access is tafa_admin_roles.
   Safe to re-run; no user/content rows are deleted.
*/

-- Keep the profile flags used by the UI synchronized with the secure admin role.
update public.profiles p
set is_admin = true,
    admin_badge = true
where exists (
  select 1
  from public.tafa_admin_roles r
  where r.user_id = p.id
    and r.role in ('admin','super_admin')
);

-- Authoritative server-side check used by the app.
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
      and r.role in ('admin','super_admin')
  );
$$;

grant execute on function public.tafa_is_admin(uuid) to authenticated;

-- Verify the configured admin.
select
  r.user_id,
  r.role,
  p.is_admin,
  p.admin_badge
from public.tafa_admin_roles r
left join public.profiles p on p.id = r.user_id
where r.user_id = 'edcfd4fe-e75e-4c66-a816-c4671021aef2';
