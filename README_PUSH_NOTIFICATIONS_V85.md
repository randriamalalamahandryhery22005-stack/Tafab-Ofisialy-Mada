# Tafaß V85 — Notifications Push quand l'application est fermée

Cette mise à jour ajoute le mécanisme **Web Push / PWA**. Elle ne remplace pas le système
Realtime existant : les sons et notifications en direct dans l'application restent en place.

## Fichiers modifiés / ajoutés

- `app.js` — enregistre l'abonnement Push de l'utilisateur après connexion et le supprime à la déconnexion.
- `sw.js` — affiche les notifications reçues en arrière-plan et ouvre Tafaß au clic.
- `TAFASS_V85_PUSH_NOTIFICATIONS.sql` — crée `push_subscriptions` avec RLS.
- `supabase/functions/tafa-push-notify/index.ts` — envoie les Push Notifications.
- `supabase/config.toml` — autorise cette Edge Function à recevoir le webhook sécurisé.

## 1. Exécuter le SQL

Dans Supabase > SQL Editor, exécuter :

`TAFASS_V85_PUSH_NOTIFICATIONS.sql`

Aucune table existante n'est supprimée.

## 2. Déployer l'Edge Function

Depuis le dossier du projet :

```bash
supabase functions deploy tafa-push-notify --no-verify-jwt
```

## 3. Ajouter les secrets Supabase

Configurer ces secrets dans Supabase :

- `VAPID_PUBLIC_KEY` = la clé publique utilisée dans `app.js`
- `VAPID_PRIVATE_KEY` = la clé privée VAPID
- `VAPID_SUBJECT` = une adresse e-mail réelle, par exemple `mailto:votre-email@example.com`
- `TAFA_PUSH_WEBHOOK_SECRET` = une chaîne secrète longue que vous choisissez

**Ne jamais mettre `VAPID_PRIVATE_KEY` dans le ZIP frontend, GitHub, Netlify ou Vercel.**

## 4. Créer le Database Webhook

Dans Supabase > Database > Webhooks :

- Table : `notifications`
- Event : `INSERT`
- URL :
  `https://qvxmaeepwrprtoaipoir.supabase.co/functions/v1/tafa-push-notify`
- Header :
  `x-tafa-push-secret: VOTRE_TAFA_PUSH_WEBHOOK_SECRET`

Le webhook doit envoyer le record JSON de la nouvelle ligne `notifications`.

## 5. Résultat

Quand une nouvelle notification est créée :

- application ouverte : le système Realtime + son existant continue de fonctionner ;
- application en arrière-plan : le Push peut apparaître ;
- application complètement fermée : le service worker affiche la notification si Android/browser autorise les Push ;
- le nom de l'auteur est affiché, par exemple **« Anina a réagi à votre publication. »**
- en appuyant sur la notification, Tafaß se rouvre.

## Important Android

Le Push nécessite une connexion HTTPS. Sur Android/Chrome, il faut autoriser les notifications
pour Tafaß. Pour une expérience PWA complète, installer Tafaß depuis le navigateur est recommandé.

Le navigateur/Android peut aussi limiter les notifications si l'utilisateur a bloqué les notifications,
désactivé les données en arrière-plan ou activé une économie d'énergie très agressive.

## Clé VAPID

La clé publique est déjà intégrée dans `app.js`. La clé privée ne doit pas être ajoutée au frontend.
Utiliser la paire VAPID fournie séparément lors de la configuration des secrets Supabase.
