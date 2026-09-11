-- ============================================================
-- Tafaß V79 — Profil : enregistrement fiable + Realtime
-- Exécuter après les SQL V75/V76/V78.
-- ============================================================

-- Autoriser chaque membre à modifier uniquement son propre profil.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profiles'
      and policyname='tafa_v79_profiles_update_own'
  ) then
    create policy tafa_v79_profiles_update_own
      on public.profiles
      for update
      to authenticated
      using (id = auth.uid())
      with check (id = auth.uid());
  end if;
exception when undefined_table then
  null;
end $$;

-- Le profil doit être diffusé en temps réel à toutes les sessions ouvertes.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
exception when undefined_table then
  null;
when undefined_object then
  null;
end $$;

-- Garantit un updated_at fiable pour les changements de profil.
create or replace function public.tafa_v79_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tafa_v79_profiles_updated_at on public.profiles;
create trigger tafa_v79_profiles_updated_at
before update on public.profiles
for each row execute function public.tafa_v79_profiles_updated_at();
