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
