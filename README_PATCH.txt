TAFAß V37 — UPDATED ONLY

Ireo ihany no novaina/nampiana:
1. app.js — corrected verification flow, production table/RPC, correct payment methods, admin verification controls and realtime.
2. TAFASS_VERIFICATION_V37_CLEAN_PATCH.sql — additive Supabase migration for verification + private badge proofs + payment/request creation + admin review.

FAMETRAHANA:
- Soloy amin'ilay app efa misy ny app.js.
- Alefaso indray mandeha ao Supabase SQL Editor ny TAFASS_VERIFICATION_V37_CLEAN_PATCH.sql.
- Aza mametraka badge_requests.sql na payments.sql legacy.
- Ho an'ny approbation admin: ny payment_transactions mifanaraka amin'ny référence dia tsy maintsy status='paid' vao azo approve ny badge.
