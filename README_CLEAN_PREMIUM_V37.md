# Tafaß — Clean Premium Release V37

## Ce qui a été corrigé
- Nettoyage des fichiers de sauvegarde `.bak`.
- Cache-busting mis à jour dans `index.html`.
- Parcours **Vérification / Badge bleu** conservé en 5 étapes et réaligné avec Supabase.
- Création atomique du dossier de vérification + paiement `payment_transactions` via RPC.
- Blocage des doublons de demandes en attente.
- Justificatifs stockés dans le bucket privé `badge-proofs`.
- Décision administrateur via `tafa_admin_review_badge`.
- Liste admin via `tafa_admin_list_badge_requests`.
- Realtime ajouté pour les demandes de badge côté dashboard admin.
- Les moyens affichés dans le formulaire sont limités à ceux acceptés par `payment_transactions` : Yas Money et Airtel Money.
- Le montant de la demande est 25 000 MGA et reste en attente de validation administrative.

## Installation Supabase
Exécuter **une seule fois** dans Supabase SQL Editor :

`TAFASS_BADGE_VERIFICATION_PREMIUM_V2.sql`

Ce script est additif et ne remplace pas les tables principales de l'application.

## Contrôle local effectué
- `node --check app.js` : OK
- références locales de `index.html` vérifiées
- archive finale reconstruite après modifications

## Important
Le paiement réel doit être confirmé par l'administration dans le système de paiement avant d'approuver un badge. Le frontend ne prétend pas confirmer automatiquement un paiement.
