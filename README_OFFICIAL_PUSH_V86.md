# Tafaß — Official Web/PWA Push V86

This patch makes the Web/PWA build the official Tafaß Android app path and fixes push registration for existing logins.

## Included
- `app.js`: registers/refreshes the Push subscription after every successful authenticated entry, not only after registration.
- `sw.js`: receives background push and displays Android notifications.
- `supabase/functions/tafa-push-notify/index.ts`: sends Web Push to saved subscriptions and removes expired endpoints.
- `TAFASS_V85_PUSH_NOTIFICATIONS.sql`: creates `push_subscriptions` if it is not already present.

## Required Supabase configuration
The source cannot safely contain the VAPID private key. Configure these Edge Function secrets:

- `TAFASS_VAPID_PUBLIC_KEY` = `BDKj0LueFYNPlQdnGr_IE0slPUgHwgkPvNwP_1zxmZOGYMj9t20upWUtHVaK_z5LGBXy77p8oXdiY4Tkd4osEMs`
- `TAFASS_VAPID_PRIVATE_KEY` = `yT-vLGOnOEX6BCwwOaM4_2uRglfa8HSnHNua3yVafo0`
- `TAFASS_VAPID_SUBJECT` = a valid `mailto:` address belonging to the service owner
- `TAFA_PUSH_WEBHOOK_SECRET` = a long random secret

The public key is also embedded in `app.js`; the private key is never placed in frontend files.

## Deploy
Deploy the Edge Function as `tafa-push-notify`.

Then create a Database Webhook for `public.notifications` on `INSERT` and point it to:
`https://qvxmaeepwrprtoaipoir.supabase.co/functions/v1/tafa-push-notify`

Send the `x-webhook-secret` header with the same `TAFA_PUSH_WEBHOOK_SECRET` value.

## Test
1. Install/reinstall the official Web/PWA APK.
2. Open Tafaß and log in.
3. Accept Android notification permission.
4. Confirm a row appears in `push_subscriptions` for that user.
5. Close Tafaß completely.
6. From another account, create a notification (message/reaction/comment/friend action).
7. The Android notification should appear even while Tafaß is closed.

Do not put the VAPID private key into `app.js`, `sw.js`, the APK, or any public repository.
