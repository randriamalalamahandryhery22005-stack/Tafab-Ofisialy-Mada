# Tafaß — Dingana 6: Monetization & Payments

Date: 2026-09-11

## Scope

Dingana 6 strengthens the existing monetization/payment flows without replacing the existing Supabase payment architecture or inventing provider credentials/endpoints.

## Changes

- Added a client-side payment action lock to prevent duplicate submissions caused by double taps/clicks.
- Added normalization and basic validation for advertising payment references and amounts before calling the existing RPC.
- Added explicit provider validation for the existing advertising payment flow.
- Added **Orange Money** as an available advertising payment method in the existing manual-reference workflow.
- Kept payment confirmation server-side: the existing RPC/admin verification flow remains authoritative.
- No fake Orange/MVola/Airtel API credentials or endpoints were added.
- No database schema, RLS, Auth, Realtime configuration, or existing business logic was replaced.

## Validation

- `node --check app.js` — PASS.

## Important production note

Orange Money Web Payment is only considered fully live after Orange provides/activates the merchant subscription and credentials, and the corresponding secure server-side integration is deployed. This step only prepares the current Tafaß payment UI/workflow and prevents duplicate/manual-reference submission errors.
