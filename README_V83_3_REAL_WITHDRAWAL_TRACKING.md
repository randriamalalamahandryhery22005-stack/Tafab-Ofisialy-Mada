# Tafaß V83.3 — Real Withdrawal Tracking + Mobile Money Payout Core

## What was wrong
The previous withdrawal flow could reserve/deduct money and create a withdrawal request, but it did not guarantee that a Mobile Money transfer was actually sent. The admin/platform flow also deducted the platform balance too early.

## V83.3 fixes
- Creator withdrawal now reserves money in `pending_earnings_mga` only.
- Admin/platform withdrawal now reserves money in `tafa_platform_wallets_v74.pending_earnings_mga` only.
- `total_withdrawn_mga` increases only after an external provider confirms the payout.
- Withdrawal status is now traceable:
  - `pending`
  - `processing`
  - `paid`
  - `failed`
  - `rejected`
- Every confirmed payout stores `provider_reference`.
- Provider errors and retry attempts are stored.
- Creator withdrawal history now shows operator, status, reference and error information.
- Admin/platform withdrawal history is also visible.
- The admin/platform withdrawal action now calls the server-side `tafa-payout` Edge Function immediately after creating the request.
- The same Edge Function handles creator and platform payouts.
- Supported destinations in this payout core: **MVola, Orange Money, Airtel Money**.

## Important: real money movement requires provider access
The ZIP does **not** contain or invent Mobile Money credentials. Secrets must remain in Supabase Edge Function environment variables.

Configure these secrets in the Supabase Edge Function environment:

```text
PAYOUT_MVOLA_URL
PAYOUT_MVOLA_TOKEN
PAYOUT_ORANGE_URL
PAYOUT_ORANGE_TOKEN
PAYOUT_AIRTEL_URL
PAYOUT_AIRTEL_TOKEN
```

Each provider URL must be a production payout/disbursement endpoint that accepts the normalized Tafaß server payload and returns a transaction reference/status.

Do NOT put these tokens in `app.js` or any public file.

## Deploy the Edge Function
Deploy/update:

`supabase/functions/tafa-payout/index.ts`

The function uses an idempotency key based on the Tafaß withdrawal ID, so retrying the same request uses the same payout identity.

## Apply SQL
Run only:

`TAFASS_V83_3_REAL_WITHDRAWAL_TRACKING.sql`

It is additive and does not delete existing users, wallets or withdrawal rows.

## Existing old withdrawals
A withdrawal that was created by an older version and has **no provider reference** cannot honestly be displayed as "paid". V83.3 exposes its status/reference/error instead. Do not manually mark such a withdrawal as paid unless the actual Mobile Money transaction can be verified.

## Provider note
MVola officially provides a developer/API program with Sandbox and a GO LIVE process, and its business portal also advertises batch transfers to beneficiaries. Production access/authorization is therefore required before Tafaß can move real funds automatically.

Papi's current public developer documentation describes payment-link collection for MVola, Orange Money and Airtel Money; it should not be assumed to provide creator payout/disbursement just because it supports incoming payments.
