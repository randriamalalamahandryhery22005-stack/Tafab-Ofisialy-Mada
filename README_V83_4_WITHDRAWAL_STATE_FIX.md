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
