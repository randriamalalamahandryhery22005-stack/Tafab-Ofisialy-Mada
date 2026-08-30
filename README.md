# Tafaß V13.1 — Premium Real

## Corrections
- Navigation Pages et Groupes renforcée : cartes ouvrables directement, retry en cas d'erreur, aucune donnée demo ajoutée.
- Les sous-options du Menu continuent d'utiliser les actions réelles Supabase.
- Connexion Google et Apple utilise `supabase.auth.signInWithOAuth()` avec le domaine courant comme redirect URL.
- Les boutons OAuth ne sont plus désactivés.

## Configuration OAuth obligatoire dans Supabase
Le code lance réellement OAuth, mais les fournisseurs doivent être activés dans Supabase :
Authentication → Providers → Google / Apple.

Dans Authentication → URL Configuration, ajoutez le domaine de production, par exemple :
https://tafab-ofisialy-mada.vercel.app

Utilisez exactement votre vrai domaine Vercel, sans l'espace éventuel de l'exemple ci-dessus.

Pour Google et Apple, renseignez aussi leurs Client ID / Secret / clés demandées par Supabase. Sans cette configuration côté fournisseur, aucun frontend ne peut effectuer une authentification OAuth réelle.


## Tafaß V22
- Navigation mobile: Pages et Groupes accessibles directement dans la barre inférieure.
- Suppression de la destination/navigation autonome « Vidéos » (les médias vidéo peuvent toujours être publiés et les Reels restent disponibles).
- Profil: couverture sans séparation noire, informations synchronisées avec l’e-mail du compte, et changement prénom/nom limité à une fois tous les 15 jours.
- Exécuter `TAFASS_V22_PROFILE_IDENTITY.sql` une seule fois dans Supabase pour activer la règle 15 jours côté base de données.


## V23 FIX
- Google/Apple: mandatory first-connection onboarding before app access.
- Account data moved to Settings; public profile keeps bio, location and photos.
- Name/prénom cooldown: 15 days.
- Separate current/origin city fields.
- Mobile bottom spacing reduced and Tafaß brand restored.
- Standalone Videos destination removed; Reels remains.
- Run `TAFASS_V23_PROFILE_ONBOARDING.sql` in Supabase.

## V25 FIX
- OAuth Google/Apple onboarding uses `tafa_complete_oauth_profile` to avoid RLS-related validation freezes.
- Mobile bottom navigation contains Actualités, Amis, Messages, Pages, Groupes and Tafaß.
- Extra bottom padding prevents the fixed navigation from covering the last content/buttons.
