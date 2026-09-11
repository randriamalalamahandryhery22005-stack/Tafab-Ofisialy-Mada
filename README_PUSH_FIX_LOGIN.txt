Tafaß V85 — Push Fix for Existing/Login Accounts

This patch fixes a missing call in app.js:
the Push subscription was registered after signup, but not when an
existing authenticated user entered the app.

Replace the project's app.js with the app.js included here, rebuild/redeploy,
then open Tafaß, allow notifications, and test with the app closed.

Important: the Supabase V85 SQL, Edge Function, VAPID secrets, and Database
Webhook described in README_PUSH_NOTIFICATIONS_V85.md must also be configured.
No existing tables or post/message logic are changed by this patch.
