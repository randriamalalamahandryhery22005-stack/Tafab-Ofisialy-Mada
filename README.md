# Tafaß — Stable Clean Build V27

Cette archive contient la version web nettoyée de Tafaß.

## Installation
1. Déployer `index.html`, `app.js` et `style.css` sur le même hébergement.
2. Pour une nouvelle base Supabase, exécuter `TAFASS_NEW_PROJECT.sql`.
3. Exécuter ensuite `TAFASS_STABLE_SETUP.sql` une fois. Il est ré-exécutable et ne supprime aucune donnée utilisateur.

## Points corrigés
- Blocage OAuth Google/Apple dû à un appel Supabase attendu directement dans `onAuthStateChange`.
- Validation onboarding avec délai maximum et gestion d'erreur.
- Détection OAuth uniquement pour Google/Apple; les comptes e-mail existants ne sont pas bloqués par l'onboarding OAuth.
- Profil public séparé des informations du compte.
- Nom/prénom limité à une modification tous les 15 jours côté base.
- Navigation mobile fixe et toujours visible avec Tafaß.
- Pas de destination Vidéos standalone.
- PDC sans barre noire/separator.
- Compatibilité avec les bases anciennes: les deux villes peuvent temporairement être conservées dans `location` si les colonnes ne sont pas encore dans le cache PostgREST.
