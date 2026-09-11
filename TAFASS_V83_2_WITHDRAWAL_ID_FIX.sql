/* ============================================================
   TAFAß V83.2 — RETRAIT ID FIX
   Fix for: column "id" does not exist

   Cause:
   tafa_platform_wallets_v74 uses user_id as its PRIMARY KEY and
   intentionally has NO id column. The previous admin withdrawal RPC
   incorrectly used "returning id" on that table.

   This migration replaces only the affected RPC. No data is deleted.
   ============================================================ */

create or replace function public.tafa_admin_request_platform_withdrawal_v74(
  p_amount_mga numeric,
  p_payout_method_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  aid uuid;
  wid uuid;
  v_balance numeric;
begin
  aid := auth.uid();

  if aid is null or not public.tafa_v74_is_admin(aid) then
    raise exception 'Accès administrateur requis';
  end if;

  if coalesce(p_amount_mga,0) < 1000 then
    raise exception 'Minimum de retrait : 1 000 Ar';
  end if;

  if p_payout_method_id is null then
    raise exception 'Moyen de retrait requis';
  end if;

  if not exists (
    select 1
      from public.tafab_creator_payout_methods pm
     where pm.id = p_payout_method_id
       and pm.user_id = aid
       and pm.status = 'active'
  ) then
    raise exception 'Moyen de retrait actif introuvable';
  end if;

  /*
     IMPORTANT:
     tafa_platform_wallets_v74 has user_id as its primary key,
     not id. Never use "returning id" on this table.
  */
  select w.earnings_mga
    into v_balance
    from public.tafa_platform_wallets_v74 w
   where w.user_id = aid
   for update;

  if v_balance is null then
    raise exception 'Portefeuille plateforme introuvable';
  end if;

  if v_balance < p_amount_mga then
    raise exception 'Solde disponible insuffisant';
  end if;

  update public.tafa_platform_wallets_v74 w
     set earnings_mga = w.earnings_mga - p_amount_mga,
         total_withdrawn_mga = coalesce(w.total_withdrawn_mga,0) + p_amount_mga,
         updated_at = now()
   where w.user_id = aid;

  insert into public.tafa_admin_withdrawals_v74(
    admin_user_id,
    amount_mga,
    payout_method_id,
    status
  )
  values(
    aid,
    round(p_amount_mga,2),
    p_payout_method_id,
    'pending'
  )
  returning id into wid;

  return wid;
end;
$$;

revoke all on function public.tafa_admin_request_platform_withdrawal_v74(numeric,uuid) from public;
grant execute on function public.tafa_admin_request_platform_withdrawal_v74(numeric,uuid) to authenticated;

notify pgrst, 'reload schema';

select 'TAFAß V83.2 — RETRAIT ID FIX APPLIED' as status;
