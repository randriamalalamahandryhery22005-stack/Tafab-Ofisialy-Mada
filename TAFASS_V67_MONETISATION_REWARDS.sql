/* =========================================================
   TAFAß V67 — MONÉTISATION PAR PALIERS RÉELS
   Récompenses calculées côté serveur uniquement.
   Migration additive/idempotente. Aucun contenu utilisateur supprimé.
   ========================================================= */


/* Source de vues vidéo si elle n'existe pas encore. */
create table if not exists public.post_views (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique(post_id,user_id)
);
create index if not exists post_views_post_idx on public.post_views(post_id,viewed_at desc);
alter table public.post_views enable row level security;
drop policy if exists tafab_v67_post_views_select on public.post_views;
drop policy if exists tafab_v67_post_views_insert on public.post_views;
create policy tafab_v67_post_views_select on public.post_views for select to authenticated
  using (user_id=auth.uid() or exists(select 1 from public.posts p where p.id=post_id and p.user_id=auth.uid()));
create policy tafab_v67_post_views_insert on public.post_views for insert to authenticated
  with check(user_id=auth.uid());
grant select,insert on public.post_views to authenticated;

create table if not exists public.tafab_monetization_rules (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  threshold bigint not null check (threshold > 0),
  reward_mga numeric(14,2) not null check (reward_mga >= 0),
  label text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(source_key,threshold)
);

insert into public.tafab_monetization_rules(source_key,threshold,reward_mga,label)
values
 ('reactions',50,500,'50 réactions'),
 ('reactions',100,1000,'100 réactions'),
 ('friends',50,1000,'50 amis'),
 ('friends',100,2500,'100 amis'),
 ('story_views',100,500,'100 vues Stories'),
 ('story_views',500,3000,'500 vues Stories'),
 ('page_followers',100,1000,'100 abonnés Pages'),
 ('page_followers',500,5000,'500 abonnés Pages'),
 ('video_views',100,500,'100 vues Vidéos'),
 ('video_views',1000,5000,'1 000 vues Vidéos'),
 ('reel_views',100,500,'100 vues Reels'),
 ('reel_views',1000,5000,'1 000 vues Reels'),
 ('first_account',1,100,'Création du compte')
on conflict(source_key,threshold) do nothing;

grant select on public.tafab_monetization_rules to authenticated;

create or replace function public.tafa_creator_monetization_stats()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  v_reactions bigint := 0;
  v_friends bigint := 0;
  v_story_views bigint := 0;
  v_page_followers bigint := 0;
  v_video_views bigint := 0;
  v_reel_views bigint := 0;
  v_first_account bigint := 0;
  result jsonb;
begin
  if uid is null then raise exception 'Connexion requise'; end if;

  select count(*) into v_reactions
    from public.post_reactions r
    join public.posts p on p.id=r.post_id
   where p.user_id=uid;

  select count(*) into v_friends
    from (
      select f.friend_id as friend_id from public.friendships f where f.user_id=uid
      union
      select f.user_id as friend_id from public.friendships f where f.friend_id=uid
    ) q;

  select count(*) into v_story_views
    from public.story_views sv
    join public.stories s on s.id=sv.story_id
   where s.user_id=uid;

  select count(*) into v_page_followers
    from public.page_followers pf
    join public.pages pg on pg.id=pf.page_id
   where pg.owner_id=uid;

  select count(*) into v_video_views
    from public.post_views pv
    join public.posts p on p.id=pv.post_id
   where p.user_id=uid and p.media_type in ('video','reel');

  select coalesce(sum(greatest(0,r.views_count)),0)::bigint into v_reel_views
    from public.reels r
   where r.user_id=uid;

  select case when exists(select 1 from public.profiles where id=uid and created_at is not null) then 1 else 0 end
    into v_first_account;

  select jsonb_build_object(
    'reactions',v_reactions,
    'friends',v_friends,
    'story_views',v_story_views,
    'page_followers',v_page_followers,
    'video_views',v_video_views,
    'reel_views',v_reel_views,
    'first_account',v_first_account,
    'reactions_earned_mga',coalesce((select sum(net_mga) from public.tafab_creator_earnings where creator_id=uid and source_type='milestone_reactions'),0),
    'friends_earned_mga',coalesce((select sum(net_mga) from public.tafab_creator_earnings where creator_id=uid and source_type='milestone_friends'),0),
    'story_views_earned_mga',coalesce((select sum(net_mga) from public.tafab_creator_earnings where creator_id=uid and source_type='milestone_story_views'),0),
    'page_followers_earned_mga',coalesce((select sum(net_mga) from public.tafab_creator_earnings where creator_id=uid and source_type='milestone_page_followers'),0),
    'video_views_earned_mga',coalesce((select sum(net_mga) from public.tafab_creator_earnings where creator_id=uid and source_type='milestone_video_views'),0),
    'reel_views_earned_mga',coalesce((select sum(net_mga) from public.tafab_creator_earnings where creator_id=uid and source_type='milestone_reel_views'),0),
    'first_account_earned_mga',coalesce((select sum(net_mga) from public.tafab_creator_earnings where creator_id=uid and source_type='milestone_first_account'),0)
  ) into result;
  return result;
end
$$;

revoke all on function public.tafa_creator_monetization_stats() from public;
grant execute on function public.tafa_creator_monetization_stats() to authenticated;

create or replace function public.tafa_sync_creator_monetization()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  approved boolean;
  r record;
  v_value bigint;
  v_source_id uuid;
  v_credited integer := 0;
begin
  if uid is null then raise exception 'Connexion requise'; end if;

  select (status='approved' and enabled=true) into approved
    from public.tafab_creator_monetization
   where user_id=uid;
  if coalesce(approved,false)=false then
    return jsonb_build_object('ok',true,'credited',0,'reason','monetization_not_approved');
  end if;

  -- Recalcule les indicateurs à partir des tables sources réelles.
  select count(*) into v_value from public.post_reactions pr join public.posts p on p.id=pr.post_id where p.user_id=uid;
  for r in select * from public.tafab_monetization_rules where active and source_key='reactions' and threshold<=v_value order by threshold loop
    v_source_id := md5(format('tafass-v67:%s:%s:%s',uid,r.source_key,r.threshold))::uuid;
    if public.tafab_record_creator_earning(uid,'milestone_reactions',v_source_id,r.reward_mga,r.label) is not null then v_credited:=v_credited+1; end if;
  end loop;

  select count(*) into v_value from (
    select f.friend_id from public.friendships f where f.user_id=uid
    union select f.user_id from public.friendships f where f.friend_id=uid
  ) q;
  for r in select * from public.tafab_monetization_rules where active and source_key='friends' and threshold<=v_value order by threshold loop
    v_source_id := md5(format('tafass-v67:%s:%s:%s',uid,r.source_key,r.threshold))::uuid;
    if public.tafab_record_creator_earning(uid,'milestone_friends',v_source_id,r.reward_mga,r.label) is not null then v_credited:=v_credited+1; end if;
  end loop;

  select count(*) into v_value from public.story_views sv join public.stories s on s.id=sv.story_id where s.user_id=uid;
  for r in select * from public.tafab_monetization_rules where active and source_key='story_views' and threshold<=v_value order by threshold loop
    v_source_id := md5(format('tafass-v67:%s:%s:%s',uid,r.source_key,r.threshold))::uuid;
    if public.tafab_record_creator_earning(uid,'milestone_story_views',v_source_id,r.reward_mga,r.label) is not null then v_credited:=v_credited+1; end if;
  end loop;

  select count(*) into v_value from public.page_followers pf join public.pages pg on pg.id=pf.page_id where pg.owner_id=uid;
  for r in select * from public.tafab_monetization_rules where active and source_key='page_followers' and threshold<=v_value order by threshold loop
    v_source_id := md5(format('tafass-v67:%s:%s:%s',uid,r.source_key,r.threshold))::uuid;
    if public.tafab_record_creator_earning(uid,'milestone_page_followers',v_source_id,r.reward_mga,r.label) is not null then v_credited:=v_credited+1; end if;
  end loop;

  select count(*) into v_value from public.post_views pv join public.posts p on p.id=pv.post_id where p.user_id=uid and p.media_type in ('video','reel');
  for r in select * from public.tafab_monetization_rules where active and source_key='video_views' and threshold<=v_value order by threshold loop
    v_source_id := md5(format('tafass-v67:%s:%s:%s',uid,r.source_key,r.threshold))::uuid;
    if public.tafab_record_creator_earning(uid,'milestone_video_views',v_source_id,r.reward_mga,r.label) is not null then v_credited:=v_credited+1; end if;
  end loop;

  select coalesce(sum(greatest(0,views_count)),0)::bigint into v_value from public.reels where user_id=uid;
  for r in select * from public.tafab_monetization_rules where active and source_key='reel_views' and threshold<=v_value order by threshold loop
    v_source_id := md5(format('tafass-v67:%s:%s:%s',uid,r.source_key,r.threshold))::uuid;
    if public.tafab_record_creator_earning(uid,'milestone_reel_views',v_source_id,r.reward_mga,r.label) is not null then v_credited:=v_credited+1; end if;
  end loop;

  select case when exists(select 1 from public.profiles where id=uid and created_at is not null) then 1 else 0 end into v_value;
  for r in select * from public.tafab_monetization_rules where active and source_key='first_account' and threshold<=v_value order by threshold loop
    v_source_id := md5(format('tafass-v67:%s:%s:%s',uid,r.source_key,r.threshold))::uuid;
    if public.tafab_record_creator_earning(uid,'milestone_first_account',v_source_id,r.reward_mga,r.label) is not null then v_credited:=v_credited+1; end if;
  end loop;

  return jsonb_build_object('ok',true,'credited',v_credited);
end
$$;

revoke all on function public.tafa_sync_creator_monetization() from public;
grant execute on function public.tafa_sync_creator_monetization() to authenticated;

/* Déclenchement léger après les événements qui modifient les indicateurs.
   La fonction est idempotente : un même palier ne peut être crédité deux fois. */
create or replace function public.tafa_sync_creator_monetization_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  target uuid;
begin
  -- Résolution explicite par table : aucune lecture d'un champ inexistant.
  if tg_table_name='post_reactions' then
    select p.user_id into target from public.posts p where p.id=new.post_id;
  elsif tg_table_name='friendships' then
    target := coalesce(new.user_id,new.friend_id);
  elsif tg_table_name='story_views' then
    select s.user_id into target from public.stories s where s.id=new.story_id;
  elsif tg_table_name='page_followers' then
    select pg.owner_id into target from public.pages pg where pg.id=new.page_id;
  elsif tg_table_name='post_views' then
    select p.user_id into target from public.posts p where p.id=new.post_id;
  elsif tg_table_name='reels' then
    target := new.user_id;
  end if;

  if target is not null then
    perform public.tafa_sync_creator_monetization_for_user(target);
  end if;
  return new;
end
$$;

revoke all on function public.tafa_sync_creator_monetization_trigger() from public;

/* Version interne accepte un créateur cible sans dépendre de auth.uid(). */
create or replace function public.tafa_sync_creator_monetization_for_user(p_creator_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  r record; v_value bigint; v_source_id uuid; v_credited integer:=0; approved boolean;
begin
  select (status='approved' and enabled=true) into approved from public.tafab_creator_monetization where user_id=p_creator_id;
  if coalesce(approved,false)=false then return jsonb_build_object('ok',true,'credited',0); end if;

  select count(*) into v_value from public.post_reactions pr join public.posts p on p.id=pr.post_id where p.user_id=p_creator_id;
  for r in select * from public.tafab_monetization_rules where active and source_key='reactions' and threshold<=v_value loop
    v_source_id:=md5(format('tafass-v67:%s:%s:%s',p_creator_id,r.source_key,r.threshold))::uuid;
    if public.tafab_record_creator_earning(p_creator_id,'milestone_reactions',v_source_id,r.reward_mga,r.label) is not null then v_credited:=v_credited+1; end if;
  end loop;

  select count(*) into v_value from (select f.friend_id from public.friendships f where f.user_id=p_creator_id union select f.user_id from public.friendships f where f.friend_id=p_creator_id) q;
  for r in select * from public.tafab_monetization_rules where active and source_key='friends' and threshold<=v_value loop
    v_source_id:=md5(format('tafass-v67:%s:%s:%s',p_creator_id,r.source_key,r.threshold))::uuid;
    if public.tafab_record_creator_earning(p_creator_id,'milestone_friends',v_source_id,r.reward_mga,r.label) is not null then v_credited:=v_credited+1; end if;
  end loop;

  select count(*) into v_value from public.story_views sv join public.stories s on s.id=sv.story_id where s.user_id=p_creator_id;
  for r in select * from public.tafab_monetization_rules where active and source_key='story_views' and threshold<=v_value loop
    v_source_id:=md5(format('tafass-v67:%s:%s:%s',p_creator_id,r.source_key,r.threshold))::uuid;
    if public.tafab_record_creator_earning(p_creator_id,'milestone_story_views',v_source_id,r.reward_mga,r.label) is not null then v_credited:=v_credited+1; end if;
  end loop;

  select count(*) into v_value from public.page_followers pf join public.pages pg on pg.id=pf.page_id where pg.owner_id=p_creator_id;
  for r in select * from public.tafab_monetization_rules where active and source_key='page_followers' and threshold<=v_value loop
    v_source_id:=md5(format('tafass-v67:%s:%s:%s',p_creator_id,r.source_key,r.threshold))::uuid;
    if public.tafab_record_creator_earning(p_creator_id,'milestone_page_followers',v_source_id,r.reward_mga,r.label) is not null then v_credited:=v_credited+1; end if;
  end loop;

  select count(*) into v_value from public.post_views pv join public.posts p on p.id=pv.post_id where p.user_id=p_creator_id and p.media_type in ('video','reel');
  for r in select * from public.tafab_monetization_rules where active and source_key='video_views' and threshold<=v_value loop
    v_source_id:=md5(format('tafass-v67:%s:%s:%s',p_creator_id,r.source_key,r.threshold))::uuid;
    if public.tafab_record_creator_earning(p_creator_id,'milestone_video_views',v_source_id,r.reward_mga,r.label) is not null then v_credited:=v_credited+1; end if;
  end loop;

  select coalesce(sum(greatest(0,views_count)),0)::bigint into v_value from public.reels where user_id=p_creator_id;
  for r in select * from public.tafab_monetization_rules where active and source_key='reel_views' and threshold<=v_value loop
    v_source_id:=md5(format('tafass-v67:%s:%s:%s',p_creator_id,r.source_key,r.threshold))::uuid;
    if public.tafab_record_creator_earning(p_creator_id,'milestone_reel_views',v_source_id,r.reward_mga,r.label) is not null then v_credited:=v_credited+1; end if;
  end loop;

  v_value:=case when exists(select 1 from public.profiles where id=p_creator_id and created_at is not null) then 1 else 0 end;
  for r in select * from public.tafab_monetization_rules where active and source_key='first_account' and threshold<=v_value loop
    v_source_id:=md5(format('tafass-v67:%s:%s:%s',p_creator_id,r.source_key,r.threshold))::uuid;
    if public.tafab_record_creator_earning(p_creator_id,'milestone_first_account',v_source_id,r.reward_mga,r.label) is not null then v_credited:=v_credited+1; end if;
  end loop;

  return jsonb_build_object('ok',true,'credited',v_credited);
end
$$;

revoke all on function public.tafa_sync_creator_monetization_for_user(uuid) from public;

drop trigger if exists tafa_v67_post_reaction_reward on public.post_reactions;
create trigger tafa_v67_post_reaction_reward after insert on public.post_reactions for each row execute function public.tafa_sync_creator_monetization_trigger();

drop trigger if exists tafa_v67_friend_reward on public.friendships;
create trigger tafa_v67_friend_reward after insert on public.friendships for each row execute function public.tafa_sync_creator_monetization_trigger();

drop trigger if exists tafa_v67_story_view_reward on public.story_views;
create trigger tafa_v67_story_view_reward after insert on public.story_views for each row execute function public.tafa_sync_creator_monetization_trigger();

drop trigger if exists tafa_v67_page_follower_reward on public.page_followers;
create trigger tafa_v67_page_follower_reward after insert on public.page_followers for each row execute function public.tafa_sync_creator_monetization_trigger();

drop trigger if exists tafa_v67_post_view_reward on public.post_views;
create trigger tafa_v67_post_view_reward after insert on public.post_views for each row execute function public.tafa_sync_creator_monetization_trigger();

drop trigger if exists tafa_v67_reel_view_reward on public.reels;
create trigger tafa_v67_reel_view_reward
after update of views_count on public.reels
for each row
when (new.views_count > old.views_count)
execute function public.tafa_sync_creator_monetization_trigger();

/* Realtime pour les règles et le ledger. */
do $$ begin
  alter publication supabase_realtime add table public.tafab_monetization_rules;
exception when duplicate_object then null; end $$;
