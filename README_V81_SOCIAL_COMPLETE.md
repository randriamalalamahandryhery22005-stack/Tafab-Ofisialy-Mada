# Tafaß V81 — Social Complete Patch

Base: **Tafaß V80 Pages & Groupes Realtime**.

## Modifications
- Correction du scroll vertical global sur mobile et desktop pour Profil, Pages, Groupes, Amis et Rechercher.
- Follow Page sécurisé par RPC V81 + fallback.
- Rejoindre/quitter Groupe sécurisé par RPC V81 + fallback.
- Demande de rejoindre un Groupe privé via `group_join_requests`.
- Realtime renforcé pour profils, amis, follows, Pages, followers, Groupes, membres et demandes de groupe.
- Amis complété: suggestions, amis, demandes reçues, demandes envoyées, abonnés, abonnements.
- Rechercher complété: comptes avec Suivre/Profil, Pages avec Suivre/Ouvrir, Groupes avec Rejoindre/Demander/Ouvrir.
- Paramètres & confidentialité conservé sur l'architecture V80 et rendu compatible avec le nouveau shell scroll.
- Aucun ancien ZIP n'est utilisé comme base: V80 reste la base unique.

## Fichiers du patch
- app.js
- style.css
- sw.js
- TAFASS_V81_SOCIAL_ACTIONS.sql
- README_V81_SOCIAL_COMPLETE.md

## Vérification
`node --check app.js` : OK.

## SQL
Exécuter `TAFASS_V81_SOCIAL_ACTIONS.sql` après le SQL V80.
