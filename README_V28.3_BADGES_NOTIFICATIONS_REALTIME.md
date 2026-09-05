# Tafaß V28.3 — Badges + Notifications Realtime

## Badge système
- Badges ajoutés à toutes les rubriques de navigation disponibles.
- Affichage: 1 à 10, puis **10+** au-delà de 10.
- Actualités, Amis, Messages, Notifications, Pages, Groupes, Reels, Évènements, Tafaß, Studio, Créateur, AI, Music, Business, Enregistrements, Paramètres/Menu.
- Les badges sont recalculés après connexion Realtime et à chaque événement pertinent.

## Notifications Realtime
- `notifications` est dans `supabase_realtime`.
- `REPLICA IDENTITY FULL` est activé pour les événements UPDATE/DELETE.
- Le canal client filtre les notifications sur `user_id=auth.uid()` afin que chaque compte ne reçoive que ses propres événements.
- Index dédiés pour les notifications non lues.
- Trigger serveur pour les demandes d'amitié, abonnements, réactions/commentaires de publications et commandes Marketplace.
- Aucun secret Supabase n'est ajouté au frontend.

## SQL
Exécuter `TAFASS_V28_3_NOTIFICATIONS_REALTIME_COMPLETE.sql` dans Supabase SQL Editor après les migrations existantes.

## Vérifications
- `node --check app.js` : OK
- ZIP : intégrité vérifiée
