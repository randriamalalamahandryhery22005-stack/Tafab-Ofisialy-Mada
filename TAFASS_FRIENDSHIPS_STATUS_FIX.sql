-- Tafaß — FIX for ERROR 42703: friendships.status does not exist
-- Run this AFTER the main Tafaß schema.
-- IMPORTANT: public.friendships has NO status column.
-- Friendship status belongs to public.friend_requests.status.

begin;

create or replace function public.tafa_can_view_social_post(
  p_owner uuid,
  p_visibility text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() = p_owner
    or coalesce(p_visibility, 'public') = 'public'
    or (
      coalesce(p_visibility, 'public') = 'friends'
      and exists (
        select 1
        from public.friendships as f
        where
          (f.user_id = auth.uid() and f.friend_id = p_owner)
          or
          (f.user_id = p_owner and f.friend_id = auth.uid())
      )
    );
$$;

grant execute on function public.tafa_can_view_social_post(uuid, text) to authenticated;

drop policy if exists posts_select on public.posts;
create policy posts_select
on public.posts
for select
to authenticated
using (public.tafa_can_view_social_post(user_id, visibility));

drop policy if exists stories_select on public.stories;
create policy stories_select
on public.stories
for select
to authenticated
using (
  public.tafa_can_view_social_post(user_id, visibility)
  and expires_at > now()
);

commit;

notify pgrst, 'reload schema';
select 'TAFAß FRIENDSHIPS STATUS FIX APPLIED' as status;
