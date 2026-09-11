# Tafaß V83.2 — Withdrawal ID Fix

## Error corrected
`column "id" does not exist`

The error occurs during the **admin/platform withdrawal** flow.

`tafa_platform_wallets_v74` has `user_id` as its primary key and does not have an `id` column. The previous RPC used `returning id` on that wallet table.

## Fix
The RPC `tafa_admin_request_platform_withdrawal_v74(...)` is replaced so that:

- the platform wallet is locked with `FOR UPDATE`;
- its balance is checked safely;
- the wallet update does NOT request `id`;
- the withdrawal row is inserted into `tafa_admin_withdrawals_v74`;
- the UUID returned is the `id` of the withdrawal row, where `id` really exists.

No existing data is deleted.

## Apply
In Supabase SQL Editor, run only:

`TAFASS_V83_2_WITHDRAWAL_ID_FIX.sql`

Then reload the app / clear the old Service Worker cache once.
