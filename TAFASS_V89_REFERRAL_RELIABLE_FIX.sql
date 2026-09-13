-- ============================================================
-- Tafaß V89 — Parrainage fiable + rattrapage des inscriptions
-- À exécuter APRÈS les SQL V74/V76/V88.
--
-- Règles :
--   • un code de parrainage peut être utilisé par plusieurs nouveaux comptes ;
--   • chaque nouveau compte ne reçoit le bonus de parrainage qu'une seule fois ;
--   • parrain : +5 000 coins ;
--   • nouveau compte : +500 coins ;
--   • les inscriptions historiques contenant un code valide sont rattrapées ;
--   • aucun bonus n'est doublé grâce aux event_key / contrainte unique.
-- ============================================================

create table if not exists public.tafa_referral_rewards_v88 (
  id uuid primary key default gen_random_uuid(),
  referred_user_id uuid not null references auth.users(id) on delete cascade,
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referral_code text not null,
  referrer_coins bigint not null default 5000,
  referred_coins bigint not null default 500,
  created_at timestamptz not null default now(),
  constraint tafa_referral_rewards_v88_one_use_per_user unique (referred_user_id),
  constraint tafa_referral_rewards_v88_not_self check (referred_user_id <> referrer_user_id)
);

alter table public.tafa_referral_rewards_v88 enable row level security;

drop policy if exists "referral rewards own read" on public.tafa_referral_rewards_v88;
create policy "referral rewards own read"
on public.tafa_referral_rewards_v88
for select
using (auth.uid() = referred_user_id or auth.uid() = referrer_user_id);

-- Fonction serveur : aucune activation de monétisation n'est requise
-- pour qu'un code de parrainage soit utilisable.
create or replace function public.tafa_v88_apply_referral(
  p_new_user uuid,
  p_referral_code text
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  ref text := upper(trim(coalesce(p_referral_code,'')));
  ref_owner uuid;
  inserted_count integer := 0;
begin
  if p_new_user is null or ref = '' then
    return false;
  end if;

  if exists (
    select 1
    from public.tafa_referral_rewards_v88
    where referred_user_id = p_new_user
  ) then
    return false;
  end if;

  select w.user_id
    into ref_owner
  from public.tafa_platform_wallets_v74 w
  where upper(trim(w.referral_code)) = ref
  limit 1;

  if ref_owner is null or ref_owner = p_new_user then
    return false;
  end if;

  perform public.tafa_v74_ensure_wallet(ref_owner);
  perform public.tafa_v74_ensure_wallet(p_new_user);

  insert into public.tafa_referral_rewards_v88(
    referred_user_id,
    referrer_user_id,
    referral_code,
    referrer_coins,
    referred_coins
  )
  values(
    p_new_user,
    ref_owner,
    ref,
    5000,
    500
  )
  on conflict (referred_user_id) do nothing;

  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    return false;
  end if;

  update public.tafa_platform_wallets_v74
  set referral_uses = coalesce(referral_uses,0) + 1,
      updated_at = now()
  where user_id = ref_owner;

  perform public.tafa_v74_credit(
    ref_owner,
    5000,
    'referral',
    'referral:' || p_new_user::text,
    'Bonus de parrainage',
    p_new_user,
    p_new_user
  );

  perform public.tafa_v74_credit(
    p_new_user,
    500,
    'referral_new_user',
    'referral_new:' || p_new_user::text,
    'Bonus d’inscription avec parrainage',
    ref_owner,
    p_new_user
  );

  perform public.tafa_v74_reward_admin(
    'referral',
    'admin_referral:' || p_new_user::text,
    p_new_user,
    p_new_user,
    25,
    'Activité de parrainage'
  );

  return true;
end;
$$;

-- Trigger définitif pour les nouveaux comptes.
create or replace function public.tafa_v89_on_new_account()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  ref text;
begin
  perform public.tafa_v74_ensure_wallet(new.id);

  perform public.tafa_v74_credit(
    new.id,
    1000,
    'signup',
    'signup:' || new.id::text,
    'Bonus de bienvenue Tafaß'
  );

  ref := upper(trim(coalesce(new.raw_user_meta_data->>'referral_code','')));

  if ref <> '' then
    perform public.tafa_v88_apply_referral(new.id, ref);
  end if;

  perform public.tafa_v74_reward_admin(
    'signup',
    'admin_signup:' || new.id::text,
    new.id,
    new.id,
    2500,
    'Nouveau compte créé'
  );

  return new;
end;
$$;

drop trigger if exists tafa_v74_auth_new_account on auth.users;
drop trigger if exists tafa_v88_auth_new_account on auth.users;
drop trigger if exists tafa_v89_auth_new_account on auth.users;

create trigger tafa_v89_auth_new_account
after insert on auth.users
for each row
execute function public.tafa_v89_on_new_account();

-- ============================================================
-- RATTRAPAGE DES INSCRIPTIONS HISTORIQUES
-- Tous les wallets sont d'abord créés pour permettre la résolution
-- des codes, puis chaque metadata referral_code est traitée une fois.
-- ============================================================

do $$
declare
  u record;
begin
  for u in
    select id
    from auth.users
  loop
    perform public.tafa_v74_ensure_wallet(u.id);
  end loop;

  for u in
    select
      id,
      upper(trim(coalesce(raw_user_meta_data->>'referral_code',''))) as referral_code
    from auth.users
    where nullif(trim(coalesce(raw_user_meta_data->>'referral_code','')), '') is not null
  loop
    perform public.tafa_v88_apply_referral(u.id, u.referral_code);
  end loop;
end;
$$;

-- Vérification : nombre réel de parrainages enregistrés.
select
  w.user_id,
  w.referral_code,
  w.referral_uses,
  count(r.id)::bigint as utilisations_reelles
from public.tafa_platform_wallets_v74 w
left join public.tafa_referral_rewards_v88 r
  on r.referrer_user_id = w.user_id
group by w.user_id, w.referral_code, w.referral_uses
order by utilisations_reelles desc, w.referral_code;
