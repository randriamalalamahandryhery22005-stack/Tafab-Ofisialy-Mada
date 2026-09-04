# Tafaß V6 — Production Hardening

## Inclus
- Realtime channel isolé par utilisateur + reconnexion progressive.
- Gestion offline/online et resynchronisation.
- Nettoyage des channels lors de la déconnexion.
- PWA (`manifest.webmanifest`) + service worker (`sw.js`) pour le shell local.
- Chargement différé des images et préchargement `metadata` des vidéos.
- Guards pour erreurs runtime/rejections.
- Suppression des fichiers `.bak` du package de production.

## Important
Les fonctions OAuth Google/Apple, FCM, TURN/WebRTC et les politiques Supabase dépendent de la configuration du projet Supabase/Firebase et des credentials réels. Le frontend ne peut pas activer à lui seul ces services externes.

## Déploiement
Servir le dossier via HTTPS (Netlify, Vercel ou serveur web). Le service worker ne fonctionne pas depuis `file://`.

## V7 Realtime Messaging
The production build now adds conversation-scoped Realtime Presence and typing indicators, plus clearer sent/read state for messages. Ephemeral presence is handled through Supabase Realtime rather than persisted as profile data. External push notifications, OAuth providers, and TURN still require their service configuration.
