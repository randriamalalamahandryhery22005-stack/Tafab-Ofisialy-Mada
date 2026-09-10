# Tafaß V67 — Monétisation Pro

Patch basé sur le build fourni du 10/09/2026.

## Fichiers modifiés / ajoutés
- `app.js` — nouveau tableau de bord Monétisation V67 + synchronisation serveur au chargement.
- `style.css` — interface premium horizontale/tableau de bord responsive.
- `index.html` — cache-busting V167.
- `sw.js` — shell V67 et cache V167.
- `TAFASS_V67_MONETISATION_REWARDS.sql` — règles de récompense et calcul serveur.

## Sources rémunérables
Les paliers par défaut sont configurables dans `tafab_monetization_rules` :
- 50 / 100 réactions
- 50 / 100 amis
- 100 / 500 vues Stories
- 100 / 500 abonnés des Pages (utilisé comme indicateur de visibilité)
- 100 / 1 000 vues Vidéos
- 100 / 1 000 vues Reels
- création du compte
- cadeaux Live déjà pris en charge par V2 : coins → revenu via le ledger serveur.

Les montants par défaut sont des récompenses internes Tafaß et peuvent être modifiés côté serveur.

## Sécurité
- Les paliers sont calculés depuis les tables réelles Supabase.
- Une même récompense ne peut être créditée qu'une seule fois grâce à un identifiant déterministe et au registre `tafab_creator_earnings`.
- Le navigateur ne peut pas augmenter `earnings_mga`.
- Les retraits continuent d'utiliser les RPC existantes et ne deviennent « Payé » qu'après paiement réel par l'administration.
- Le bouton de retrait reste donc lié au vrai solde serveur, pas à une valeur affichée localement.

## SQL
Exécuter `TAFASS_V67_MONETISATION_REWARDS.sql` après les migrations de monétisation V1/V2 déjà présentes dans le projet.

## Validation
`node --check app.js` : OK.
