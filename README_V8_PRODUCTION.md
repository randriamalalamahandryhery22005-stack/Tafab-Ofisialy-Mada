# Tafaß V8 Production — 04/09/2026

## Messaging
- Reply action: inserts a quoted reference into the composer without requiring a new schema column.
- Edit: updates only messages owned by the authenticated sender.
- Delete: deletes only messages owned by the authenticated sender.
- Conversation is refreshed after a successful mutation.
- Existing realtime channel remains responsible for cross-device synchronization.

## Important
Supabase RLS remains authoritative. If UPDATE/DELETE policies do not permit the sender to mutate their own message, the UI shows the returned Supabase error rather than bypassing security.

External services such as FCM, OAuth providers and TURN still require their real provider configuration.
