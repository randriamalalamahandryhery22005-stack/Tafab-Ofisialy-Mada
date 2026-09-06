-- =========================================================
-- Tafaß — Feed intelligent + compteurs de vues
-- À exécuter une seule fois dans Supabase SQL Editor.
-- =========================================================

create table if not exists public.post_views (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique(post_id, user_id)
);

create index if not exists post_views_post_idx
  on public.post_views(post_id, viewed_at desc);

alter table public.post_views enable row level security;

drop policy if exists post_views_select on public.post_views;
drop policy if exists post_views_insert on public.post_views;

-- Les détails des personnes qui ont vu une vidéo restent privés.
-- Le compteur global est exposé uniquement par la fonction ci-dessous.
create policy post_views_select
on public.post_views
for select to authenticated
using (user_id = auth.uid() or exists (
  select 1 from public.posts p
  where p.id = post_id and p.user_id = auth.uid()
));

create policy post_views_insert
on public.post_views
for insert to authenticated
with check (user_id = auth.uid());

create or replace function public.tafa_record_post_view(p_post_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  total bigint;
begin
  if auth.uid() is null then
    raise exception 'Utilisateur non authentifié';
  end if;

  if not exists (select 1 from public.posts where id = p_post_id) then
    raise exception 'Publication introuvable';
  end if;

  insert into public.post_views(post_id, user_id)
  values (p_post_id, auth.uid())
  on conflict (post_id, user_id) do nothing;

  select count(*) into total
  from public.post_views
  where post_id = p_post_id;

  return total;
end;
$$;

grant execute on function public.tafa_record_post_view(uuid) to authenticated;

create or replace function public.tafa_post_view_count(p_post_id uuid)
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.post_views
  where post_id = p_post_id;
$$;

grant execute on function public.tafa_post_view_count(uuid) to authenticated;

-- Sécurité supplémentaire pour les appels directs à la table.
grant select, insert on public.post_views to authenticated;

-- Realtime pour que les compteurs puissent se synchroniser rapidement.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.post_views;
    exception when duplicate_object then
      null;
    end;
  end if;
end $$;
