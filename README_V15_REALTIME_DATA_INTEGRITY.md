# Tafaß V15 — Realtime & Data Integrity Audit

## Correctifs inclus
- Réponses aux messages désormais persistées via `messages.reply_to_id`.
- Prévisualisation de la réponse reconstruite après rechargement de la conversation.
- Realtime conversation élargi à INSERT/UPDATE/DELETE.
- Realtime Groupes : réactions/commentaires/publications et discussion groupe rafraîchis.
- Migration idempotente pour publication `supabase_realtime` des tables principales.
- `REPLICA IDENTITY FULL` sur les tables nécessaires aux événements UPDATE/DELETE.
- Index `messages(reply_to_id)`.
- Cache frontend bumpé pour forcer le chargement de V15.

## Validation
- `node --check app.js` : PASS
- ZIP integrity : PASS

## À exécuter dans Supabase
`TAFASS_V15_REALTIME_DATA_INTEGRITY.sql`

La migration ne remplace pas les politiques RLS. Les permissions serveur restent obligatoires.
