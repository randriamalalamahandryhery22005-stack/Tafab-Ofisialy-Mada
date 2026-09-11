# Tafaß V83.4 — Withdrawal State Integrity

## Fix included
- Corrects the legacy V74 platform withdrawal accounting where a still-pending withdrawal could already appear in `Total retiré`.
- Adds an explicit admin-only reconciliation action: **Corriger l’ancien retrait**.
- The correction is intentionally guarded: it only works for a pending request with no provider reference, no payout attempt, no processed/paid timestamp, and no existing pending wallet amount.
- After correction, the amount is moved to `En traitement` and removed from `Total retiré`.
- No money is sent by the reconciliation itself.

## Payout adapter fixes
- Creator payout method ownership is now resolved against the creator, not the admin triggering the payout.
- If a production provider endpoint is not configured, the request remains `En attente` instead of being falsely marked `Échec`.

## Important
The actual transfer to MVola, Orange Money or Airtel Money still requires the operator's authorized production payout/disbursement access and credentials. The generic `tafa-payout` adapter does not invent provider endpoints or credentials.

# V83.5 — Mobile Money Ready: MVola / Orange Money / Airtel Money

V83.5 prepares one secure payout pipeline for the three Madagascar Mobile Money providers.
It does **not** invent or hard-code provider API endpoints. The official production contract and credentials must be supplied by the operator or an authorized payment provider.

## Supported providers

- MVola (`mvola`)
- Orange Money (`orange_money`)
- Airtel Money (`airtel_money`)

The frontend only stores the beneficiary method. API credentials stay in Supabase Edge Function Secrets.

## Edge Function secrets

Required per provider:

```text
PAYOUT_MVOLA_URL
PAYOUT_MVOLA_TOKEN or PAYOUT_MVOLA_API_KEY
PAYOUT_MVOLA_AUTH_HEADER (optional; defaults to Authorization)
PAYOUT_MVOLA_ADAPTER (default: normalized)
PAYOUT_MVOLA_WEBHOOK_SECRET

PAYOUT_ORANGE_URL
PAYOUT_ORANGE_TOKEN or PAYOUT_ORANGE_API_KEY
PAYOUT_ORANGE_AUTH_HEADER (optional; defaults to Authorization)
PAYOUT_ORANGE_ADAPTER (default: normalized)
PAYOUT_ORANGE_WEBHOOK_SECRET

PAYOUT_AIRTEL_URL
PAYOUT_AIRTEL_TOKEN or PAYOUT_AIRTEL_API_KEY
PAYOUT_AIRTEL_AUTH_HEADER (optional; defaults to Authorization)
PAYOUT_AIRTEL_ADAPTER (default: normalized)
PAYOUT_AIRTEL_WEBHOOK_SECRET
```

The `normalized` adapter sends this internal contract to the configured payout gateway:

```json
{
  "reference": "TAFASS withdrawal UUID",
  "amount": 1000,
  "currency": "MGA",
  "provider": "mvola | orange_money | airtel_money",
  "beneficiary": {"name":"...", "phone":"034..."},
  "metadata": {"platform":false,"tafass_request_id":"..."}
}
```

If an operator gives Tafaß a different API schema, implement a provider-specific adapter instead of changing the frontend or wallet logic.

## Webhook

New Edge Function: `tafa-payout-webhook`.

It accepts signed callbacks using:
- `X-TafaSS-Provider: mvola | orange_money | airtel_money`
- `X-TafaSS-Signature: sha256=<HMAC-SHA256(raw body)>`

This is a Tafaß-side webhook contract. The official operator gateway/adapter must either call it using this contract or translate the operator's callback into it.

## State rules

`pending` → `processing` → `paid`

or

`pending/processing` → `failed`

The wallet is only counted in `total_withdrawn_mga` after a provider confirmation/reference is received. Failed withdrawals can be rejected/refunded through the existing secure RPC flow.

## Production requirement

A production transfer cannot be simulated by code alone. MVola, Orange Money, and Airtel Money each require the appropriate business/developer access and production credentials/contract. Never put those secrets in `app.js`.
