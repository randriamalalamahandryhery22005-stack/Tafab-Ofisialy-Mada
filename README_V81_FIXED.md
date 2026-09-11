# Tafaß V81 — corrected patch

## Olana hita
Ny erreur hita amin'ilay screenshot:

`column reference "is_admin" is ambiguous`

dia avy amin'ny **V78** (`TAFASS_V78_ADMIN_SINGLE_VERSION.sql`), satria nisy variable PL/pgSQL nantsoina hoe `is_admin` sy colonne `profiles.is_admin` tamin'ny `SELECT` iray ihany.

## Fix
- `TAFASS_V78_ADMIN_AMBIGUITY_FIX.sql` : manolo ilay fonction V78 voakasika, mampiasa `v_is_admin` sy `p.is_admin`.
- `TAFASS_V81_SOCIAL_ACTIONS.sql` : version V81 nohavaozina.
  - mamorona `group_join_requests` raha mbola tsy misy;
  - RLS + grants + indexes;
  - RPC Page Follow / Group Join / Group Membership;
  - realtime idempotent;
  - tsy mampiditra table duplicate.

## Ordre
1. V80 efa ampiharina.
2. Alefaso `TAFASS_V78_ADMIN_AMBIGUITY_FIX.sql`.
3. Alefaso `TAFASS_V81_SOCIAL_ACTIONS.sql`.

Ireo no fichiers novaina/ampiana ihany. Tsy tafiditra ato ny fichiers hafa tsy voakitika.
