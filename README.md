# Tafaß — ZIP final stable

Ce ZIP contient la version finale web/APK de Tafaß avec une interface premium responsive et une navigation unifiée.

## Runtime
- `index.html` — Splash, Connexion, Inscription, récupération de mot de passe et shell de l'application.
- `style.css` — interface premium, sombre/clair, responsive Android/web.
- `app.js` — Supabase Auth, navigation, Actualités, Amis, Messages, Alertes, Pages, Groupes, Reels, Tafaß, Recherche, Menu et Paramètres.

## Supabase
- `TAFASS_COMPLETE_SCHEMA.sql` — schéma consolidé et objets complémentaires utilisés par cette version.

Le ZIP ne contient plus les anciens scripts SQL versionnés ni les copies de setup qui pouvaient provoquer des doublons. Si votre projet Supabase est déjà configuré, ne relancez pas un ancien script supprimé.

## Points de stabilité
- Splash limité dans le temps et libéré dès que l'initialisation est prête.
- L'application complète reste cachée pendant l'authentification.
- Authentification e-mail/téléphone avec récupération du mot de passe par lien Supabase.
- OAuth Google/Apple conservé si les providers sont activés dans Supabase.
- Une seule navigation desktop et une seule navigation mobile.
- Bouton Retour avec pile de navigation pour les pages secondaires et les options du Menu.
- Titres de pages avec identité visuelle Tafaß.
- Mode sombre et mode clair.
- Realtime Supabase pour les sections qui le supportent.

> Important : aucune interface cliente ne peut garantir « zéro problème » sans tester les règles RLS, les buckets Storage, les providers OAuth et les données réelles du projet Supabase cible. Le code fourni évite les erreurs connues côté front et le schéma consolide les objets nécessaires, mais la configuration Supabase reste indispensable.


## Mise en production Supabase
1. Ouvrir le projet Supabase correspondant à l'URL configurée dans `app.js`.
2. Exécuter `TAFASS_COMPLETE_SCHEMA.sql` une seule fois dans SQL Editor. Le script utilise `IF NOT EXISTS` et ignore les doublons de publication Realtime.
3. Dans Authentication > URL Configuration, ajouter l'URL exacte de l'application (Web ou domaine utilisé par l'APK/WebView) aux Redirect URLs, notamment pour `?reset=1`.
4. Activer uniquement les providers OAuth réellement configurés (Google/Apple).
5. Vérifier les buckets Storage et leurs policies avant publication.
6. Ne jamais placer une `service_role` key dans l'application. Seule la publishable/anon key doit être côté client.

## Vérifications effectuées sur ce build
- ZIP integrity: OK
- JavaScript syntax: OK
- Le formulaire d'inscription finalise le profil avec `upsert` afin de fonctionner même si le trigger de profil n'a pas encore créé la ligne.


## Tafaß FINAL COMPLETE REALTIME — Supabase connection

This build is aligned with `TAFASS_COMPLETE_SCHEMA.sql` (the supplied
`TAFASS_FINAL_COMPLETE_REALTIME.sql`).

- Supabase client remains configured in `app.js`.
- Realtime subscribes to the production tables defined by the final SQL,
  including messages, conversations, posts, reactions, shares, notifications,
  friends, groups, pages, stories, reels, calls and media assets.
- Existing client uploads use the SQL-provisioned public `posts` Storage bucket,
  so this build does not require a separate `profile-media` bucket.
- The SQL itself is idempotent and duplicate-safe for Realtime publication
  membership.

## Pages & Groupes Premium
Run `PAGES_GROUPS_PREMIUM_REALTIME.sql` once after the main Supabase schema. It is idempotent and does not delete existing rows. It adds Page managers, Page/Group post reactions/comments, Page contact messages, Group discussion messages and duplicate-safe Realtime.
