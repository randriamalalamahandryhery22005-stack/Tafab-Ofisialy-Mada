# Tafaß Push Notify — Fixed

This version fixes the misleading `no_subscription` response:
- subscription query errors are detected and returned as `subscription_query_failed`
- subscription data is read before actor profile lookup
- service-role authorization headers are explicit
- push sending and cleanup behavior is preserved

Deploy this `index.ts` to the existing Supabase Edge Function:
`tafa-push-notify`

Do not replace or expose any Supabase/VAPID secrets. Keep the existing Edge Function secrets unchanged.
