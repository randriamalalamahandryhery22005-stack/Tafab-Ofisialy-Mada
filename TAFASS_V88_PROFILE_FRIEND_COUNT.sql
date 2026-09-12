-- Tafaß V88 — Secure profile friends counter
-- Fixes public profiles showing "0 ami(e)s" when the account really has friends.
-- friendships stores accepted friendships as directional rows; this function
-- counts distinct friends on either side without exposing the friendship list.

begin;

create or replace function public.tafa_profile_friend_count(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct case
    when f.user_id = p_user_id then f.friend_id
    when f.friend_id = p_user_id then f.user_id
  end)::bigint
  from public.friendships as f
  where (f.user_id = p_user_id or f.friend_id = p_user_id)
    and f.user_id <> f.friend_id
    and not public.tafa_is_blocked(p_user_id, case
      when f.user_id = p_user_id then f.friend_id
      else f.user_id
    end);
$$;

grant execute on function public.tafa_profile_friend_count(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;

select 'TAFAß V88 PROFILE FRIEND COUNT READY' as status;
