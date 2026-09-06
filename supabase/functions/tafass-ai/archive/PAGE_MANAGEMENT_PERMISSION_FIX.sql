/* TAFAß — PAGE MANAGEMENT PERMISSIONS FIX
   Safe/idempotent. No DROP TABLE / DELETE.
*/
grant usage on schema public to authenticated;
grant select,insert,update,delete on public.pages, public.page_members to authenticated;

drop policy if exists pages_select_authenticated on public.pages;
drop policy if exists pages_insert_authenticated on public.pages;
drop policy if exists pages_update_owner_or_admin on public.pages;
drop policy if exists pages_delete_owner on public.pages;

create policy pages_select_authenticated on public.pages
for select to authenticated using (true);

create policy pages_insert_authenticated on public.pages
for insert to authenticated with check (owner_id = auth.uid());

create policy pages_update_owner_or_admin on public.pages
for update to authenticated
using (
  owner_id = auth.uid()
  or exists (
    select 1 from public.page_members m
    where m.page_id = id and m.user_id = auth.uid() and m.role in ('owner','admin')
  )
)
with check (owner_id = auth.uid());

create policy pages_delete_owner on public.pages
for delete to authenticated using (owner_id = auth.uid());

-- Team management remains owner-controlled in the stable Page schema.

NOTIFY pgrst, 'reload schema';
select 'TAFAß PAGE MANAGEMENT PERMISSIONS FIXED' as status;
