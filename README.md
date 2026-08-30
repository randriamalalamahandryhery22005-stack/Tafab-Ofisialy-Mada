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
