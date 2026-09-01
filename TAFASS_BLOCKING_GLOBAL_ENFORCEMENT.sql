/* TAFAß — Blocage global: les deux comptes ne se voient ni ne communiquent.
   Le client masque l'UI et ces triggers empêchent aussi les nouvelles interactions côté DB. */

create or replace function public.tafa_is_blocked(a uuid,b uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.blocked_profiles where (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a));
$$;
grant execute on function public.tafa_is_blocked(uuid,uuid) to authenticated;

create or replace function public.tafa_block_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare a uuid; b uuid; c uuid;
begin
  if tg_table_name='friend_requests' then a:=new.sender_id; b:=new.receiver_id;
  elsif tg_table_name='friendships' then a:=new.user_id; b:=new.friend_id;
  elsif tg_table_name='follows' then a:=new.follower_id; b:=new.following_id;
  elsif tg_table_name='post_reactions' then a:=new.user_id; select user_id into b from public.posts where id=new.post_id;
  elsif tg_table_name='comments' then a:=new.user_id; select user_id into b from public.posts where id=new.post_id;
  elsif tg_table_name='post_shares' then a:=new.user_id; select user_id into b from public.posts where id=new.post_id;
  elsif tg_table_name='story_views' then a:=new.user_id; select user_id into b from public.stories where id=new.story_id;
  elsif tg_table_name='comment_likes' then a:=new.user_id; select user_id into c from public.comments where id=new.comment_id; if c is not null then select user_id into b from public.comments where id=new.comment_id; end if;
  elsif tg_table_name='conversation_members' then
    a:=new.user_id; select user_id into c from public.conversation_members where conversation_id=new.conversation_id and user_id<>new.user_id limit 1;
    if c is not null and public.tafa_is_blocked(a,c) then raise exception 'Interaction bloquée entre ces comptes'; end if;
    return new;
  elsif tg_table_name='messages' then
    a:=new.sender_id; select cm.user_id into c from public.conversation_members cm where cm.conversation_id=new.conversation_id and cm.user_id<>new.sender_id limit 1;
    if c is not null and public.tafa_is_blocked(a,c) then raise exception 'Message impossible: compte bloqué'; end if;
    return new;
  else return new;
  end if;
  if a is not null and b is not null and public.tafa_is_blocked(a,b) then
    raise exception 'Interaction impossible: compte bloqué';
  end if;
  return new;
end $$;

drop trigger if exists tafa_block_friend_requests on public.friend_requests;
create trigger tafa_block_friend_requests before insert or update on public.friend_requests for each row execute function public.tafa_block_guard();
drop trigger if exists tafa_block_friendships on public.friendships;
create trigger tafa_block_friendships before insert or update on public.friendships for each row execute function public.tafa_block_guard();
drop trigger if exists tafa_block_follows on public.follows;
create trigger tafa_block_follows before insert or update on public.follows for each row execute function public.tafa_block_guard();
drop trigger if exists tafa_block_post_reactions on public.post_reactions;
create trigger tafa_block_post_reactions before insert or update on public.post_reactions for each row execute function public.tafa_block_guard();
drop trigger if exists tafa_block_comments on public.comments;
create trigger tafa_block_comments before insert or update on public.comments for each row execute function public.tafa_block_guard();
drop trigger if exists tafa_block_post_shares on public.post_shares;
create trigger tafa_block_post_shares before insert or update on public.post_shares for each row execute function public.tafa_block_guard();
drop trigger if exists tafa_block_story_views on public.story_views;
create trigger tafa_block_story_views before insert or update on public.story_views for each row execute function public.tafa_block_guard();
drop trigger if exists tafa_block_conversation_members on public.conversation_members;
create trigger tafa_block_conversation_members before insert or update on public.conversation_members for each row execute function public.tafa_block_guard();
drop trigger if exists tafa_block_messages on public.messages;
create trigger tafa_block_messages before insert or update on public.messages for each row execute function public.tafa_block_guard();

notify pgrst,'reload schema';
select 'TAFAß — BLOCAGE GLOBAL ENFORCÉ' as status;

-- Réaction aux commentaires d'un compte bloqué
DROP TRIGGER IF EXISTS tafa_block_comment_likes ON public.comment_likes;
CREATE TRIGGER tafa_block_comment_likes BEFORE INSERT OR UPDATE ON public.comment_likes
FOR EACH ROW EXECUTE FUNCTION public.tafa_block_guard();

-- Masquer les profils des comptes bloqués dans toutes les requêtes authentifiées
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
USING (id=auth.uid() OR NOT public.tafa_is_blocked(id,auth.uid()));

-- Masquer les publications des comptes bloqués au niveau DB
DROP POLICY IF EXISTS posts_select ON public.posts;
CREATE POLICY posts_select ON public.posts FOR SELECT TO authenticated
USING ((visibility='public' OR user_id=auth.uid()) AND NOT public.tafa_is_blocked(user_id,auth.uid()));

-- Masquer les réactions/commentaires liés aux comptes bloqués
DROP POLICY IF EXISTS reactions_select ON public.post_reactions;
CREATE POLICY reactions_select ON public.post_reactions FOR SELECT TO authenticated
USING (
  NOT public.tafa_is_blocked(user_id,auth.uid())
  AND NOT public.tafa_is_blocked((SELECT user_id FROM public.posts WHERE id=post_id),auth.uid())
);
DROP POLICY IF EXISTS comments_select ON public.comments;
CREATE POLICY comments_select ON public.comments FOR SELECT TO authenticated
USING (
  NOT public.tafa_is_blocked(user_id,auth.uid())
  AND NOT public.tafa_is_blocked((SELECT user_id FROM public.posts WHERE id=post_id),auth.uid())
);

-- Relations et demandes masquées entre comptes bloqués
DROP POLICY IF EXISTS friend_requests_select ON public.friend_requests;
CREATE POLICY friend_requests_select ON public.friend_requests FOR SELECT TO authenticated
USING ((sender_id=auth.uid() OR receiver_id=auth.uid()) AND NOT public.tafa_is_blocked(sender_id,receiver_id));
DROP POLICY IF EXISTS friendships_select ON public.friendships;
CREATE POLICY friendships_select ON public.friendships FOR SELECT TO authenticated
USING ((user_id=auth.uid() OR friend_id=auth.uid()) AND NOT public.tafa_is_blocked(user_id,friend_id));
DROP POLICY IF EXISTS follows_select ON public.follows;
CREATE POLICY follows_select ON public.follows FOR SELECT TO authenticated
USING (NOT public.tafa_is_blocked(follower_id,following_id));

-- Conversations : invisibles lorsque l'autre membre est bloqué
CREATE OR REPLACE FUNCTION public.tafa_conversation_visible(p_conversation_id uuid,p_viewer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id=p_conversation_id
      AND cm.user_id<>p_viewer
      AND public.tafa_is_blocked(cm.user_id,p_viewer)
  );
$$;
grant execute on function public.tafa_conversation_visible(uuid,uuid) to authenticated;
DROP POLICY IF EXISTS members_select ON public.conversation_members;
CREATE POLICY members_select ON public.conversation_members FOR SELECT TO authenticated
USING ((user_id=auth.uid() OR public.tafa_is_conversation_member(conversation_id,auth.uid())) AND public.tafa_conversation_visible(conversation_id,auth.uid()));
DROP POLICY IF EXISTS messages_select ON public.messages;
CREATE POLICY messages_select ON public.messages FOR SELECT TO authenticated
USING ((sender_id=auth.uid() OR public.tafa_is_conversation_member(conversation_id,auth.uid())) AND public.tafa_conversation_visible(conversation_id,auth.uid()));

-- Notifications provenant d'un compte bloqué ne sont plus visibles
DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated
USING (user_id=auth.uid() AND (actor_id IS NULL OR NOT public.tafa_is_blocked(actor_id,auth.uid())));

notify pgrst,'reload schema';
select 'TAFAß — BLOCAGE GLOBAL + RLS SELECT ENFORCEMENT SUCCESS' as status;
