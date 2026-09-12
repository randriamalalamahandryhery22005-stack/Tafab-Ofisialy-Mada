-- ============================================================
-- Tafaß V88 — Correction parrainage + coins
-- À exécuter APRÈS les SQL V74/V76 déjà installés.
-- Un code peut être utilisé par plusieurs nouveaux comptes.
-- Un même nouveau compte ne peut être récompensé qu'une seule fois.
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
  ref_active boolean := false;
  inserted_count integer := 0;
begin
  if p_new_user is null or ref = '' then
    return false;
  end if;

  -- Un seul bonus de parrainage pour chaque nouveau compte.
  if exists (
    select 1 from public.tafa_referral_rewards_v88
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

  -- Le propriétaire doit être Admin ou créateur monétisé/validé.
  select exists (
    select 1
    from public.profiles rp
    left join public.tafab_creator_monetization cm on cm.user_id = rp.id
    where rp.id = ref_owner
      and (
        coalesce(rp.is_admin,false) = true
        or (coalesce(cm.enabled,false) = true and cm.status = 'approved')
      )
  ) into ref_active;

  if not ref_active then
    return false;
  end if;

  -- Réservation atomique : le même nouveau compte ne peut pas être crédité deux fois.
  insert into public.tafa_referral_rewards_v88(
    referred_user_id, referrer_user_id, referral_code,
    referrer_coins, referred_coins
  )
  values(p_new_user, ref_owner, ref, 5000, 500)
  on conflict (referred_user_id) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    return false;
  end if;

  -- Le code reste réutilisable par d'autres nouveaux comptes.
  update public.tafa_platform_wallets_v74
  set referral_uses = coalesce(referral_uses,0) + 1,
      updated_at = now()
  where user_id = ref_owner;

  -- Crédit serveur idempotent grâce à event_key unique.
  perform public.tafa_v74_credit(
    ref_owner, 5000, 'referral',
    'referral:' || p_new_user::text,
    'Bonus de parrainage', p_new_user, p_new_user
  );

  perform public.tafa_v74_credit(
    p_new_user, 500, 'referral_new_user',
    'referral_new:' || p_new_user::text,
    'Bonus d’inscription avec parrainage', ref_owner, p_new_user
  );

  perform public.tafa_v74_reward_admin(
    'referral', 'admin_referral:' || p_new_user::text,
    p_new_user, p_new_user, 25, 'Activité de parrainage'
  );

  return true;
end;
$$;

-- Remplace le trigger d'inscription : le bonus standard reste 1 000 coins,
-- puis le parrainage ajoute 5 000 au parrain et 500 au nouveau compte.
create or replace function public.tafa_v88_on_new_account()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  ref text;
begin
  perform public.tafa_v74_ensure_wallet(new.id);

  -- Bonus de bienvenue, une seule fois grâce à event_key.
  perform public.tafa_v74_credit(
    new.id, 1000, 'signup', 'signup:' || new.id::text,
    'Bonus de bienvenue Tafaß'
  );

  ref := upper(trim(coalesce(new.raw_user_meta_data->>'referral_code','')));
  if ref <> '' then
    perform public.tafa_v88_apply_referral(new.id, ref);
  end if;

  perform public.tafa_v74_reward_admin(
    'signup', 'admin_signup:' || new.id::text,
    new.id, new.id, 2500, 'Nouveau compte créé'
  );

  return new;
end;
$$;

drop trigger if exists tafa_v74_auth_new_account on auth.users;
drop trigger if exists tafa_v88_auth_new_account on auth.users;
create trigger tafa_v88_auth_new_account
after insert on auth.users
for each row execute function public.tafa_v88_on_new_account();

-- Vérification rapide : cette requête doit retourner les colonnes de suivi.
select column_name, data_type
from information_schema.columns
where table_schema='public'
  and table_name='tafa_referral_rewards_v88'
order by ordinal_position;
