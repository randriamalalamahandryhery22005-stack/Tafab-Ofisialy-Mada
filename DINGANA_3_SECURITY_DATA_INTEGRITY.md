# Tafaß — Dingana 3: Security & Data Integrity

Date: 2026-09-11

## Scope
Security hardening ciblée, sans changement de schéma Supabase ni de logique métier existante. Seuls les fichiers réellement modifiés/ajoutés sont inclus.

## Fichiers
- `app.js` — modification ciblée d'un lien externe contrôlé par des données utilisateur; la fonction `safeHttpUrl()` existait déjà dans le projet et est maintenant utilisée sur les `href` sensibles.
- `supabase/functions/tafass-ai/index.ts` — durcissement de l'endpoint AI.

## Durcissement AI
- CORS configurable avec `TAFASS_ALLOWED_ORIGINS` (origines séparées par virgules); `*` reste le mode de compatibilité si la variable n'est pas configurée.
- `Vary: Origin` et `Cache-Control: no-store`.
- Limite de corps HTTP à 16 KB et rejet des JSON invalides.
- Authentification Supabase conservée avant appel OpenAI.
- Limite prompt 8 000 caractères conservée.
- `user_id` inutile retiré de la réponse API.

## Durcissement URL frontend
Les `href` construits depuis des données externes utilisent désormais `safeHttpUrl()`, qui n'accepte que `http:` et `https:`. Cela évite qu'une valeur comme `javascript:` soit injectée dans un lien HTML.

## Préservé volontairement
- Supabase / tables / schéma
- RLS et Realtime
- Authentification
- Publications, amis, messages et notifications
- Paiements Orange Money / MVola / Airtel Money

Aucune migration SQL historique n'est ajoutée ni exécutée automatiquement.

## Tests statiques
- `node --check app.js` : PASS
- Vérification des nouvelles protections AI : PASS
- Aucun secret `service_role` ajouté au frontend.

Cette étape est une hardening statique; elle ne remplace pas un test de sécurité sur le projet Supabase réel.
