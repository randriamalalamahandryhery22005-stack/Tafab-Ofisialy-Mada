# Tafaß V80 — Pages & Groupes Realtime

Patch basé sur V79. Il remplace l'entrée de navigation Pages/Groupes par une interface V80 unique, premium et temps réel.

## Pages
- Hub V80 unique : Mes Pages / Découvrir.
- Suivre une Page.
- Les publications des Pages suivies remontent dans Actualités.
- Realtime sur pages, abonnements et publications.
- Suppression différée : 15 jours, annulable avant l'échéance.
- Après l'échéance : suppression définitive automatique côté serveur si pg_cron est disponible.
- Équipe : Administrateur, Éditeur, Modérateur.

## Groupes
- Hub V80 unique : Mes groupes / Découvrir.
- Les publications des groupes rejoints remontent dans Actualités.
- Realtime sur groupes, membres et publications.
- Suppression différée : 7 jours, annulable avant l'échéance.
- Après l'échéance : suppression définitive automatique côté serveur si pg_cron est disponible.
- Équipe : Administrateur, Éditeur, Modérateur.

## Administrateur Tafaß
- Peut ouvrir la gestion d'équipe d'une Page ou d'un Groupe.
- Peut ajouter directement un gestionnaire avec rôle Administrateur / Éditeur / Modérateur.
- Peut modifier les rôles.
- Peut déclencher la suppression différée.

## Installation
1. Garder les fichiers V79 et remplacer uniquement ceux présents dans ce patch.
2. Exécuter `TAFASS_V80_PAGES_GROUPS_REALTIME.sql` dans Supabase.
3. Déployer la nouvelle version de l'application.

`node --check app.js` doit rester PASS.
