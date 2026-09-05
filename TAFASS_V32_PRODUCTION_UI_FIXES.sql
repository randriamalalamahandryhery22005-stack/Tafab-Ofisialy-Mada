-- Tafaß V32 — production fixes requested
-- 1) Automatically closes abandoned Live sessions older than the configured threshold.
-- 2) Safe to run repeatedly.

create or replace function public.tafa_cleanup_stale_live_sessions(p_max_age_minutes integer default 360)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_minutes integer := greatest(30, least(coalesce(p_max_age_minutes, 360), 1440));
begin
  update public.live_sessions
     set status = 'ended',
         ended_at = coalesce(ended_at, now())
   where status = 'live'
     and started_at < now() - make_interval(mins => v_minutes);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.tafa_cleanup_stale_live_sessions(integer) to authenticated;

comment on function public.tafa_cleanup_stale_live_sessions(integer)
is 'Closes abandoned Tafaß Live sessions older than the supplied age threshold.';
