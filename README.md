# Tafaß V30 STABLE

V30 is based on the last working Tafaß V29 build and applies only stability/UI fixes:

- readable light mode;
- profile editor with visible fixed Save/Cancel actions on small screens;
- account information UI with non-clipped phone field;
- splash gate so the app is revealed only after the splash has finished;
- one canonical payment interface and duplicate pending-request protection;
- payment requests stored in Supabase (not a fake success screen);
- responsive safe-area spacing for small phones.

## Supabase
Run `TAFASS_PAYMENT_SETUP.sql` once if `payment_transactions` does not already exist.

A payment request is database-backed and auditable. Actual Airtel Money/Yas Money settlement requires the merchant/provider API and credentials; the app never marks a request as `paid` by itself.
