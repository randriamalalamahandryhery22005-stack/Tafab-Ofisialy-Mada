# Tafaß — Page Premium Realtime v2

Cette version traite **les Pages uniquement** avant le module Groupes.

## Fonctionnel
- Création d'une Page
- Logo + couverture via Supabase Storage
- Nom, @username, catégorie, présentation
- Coordonnées professionnelles: adresse, email, téléphone, site web
- Suivre / ne plus suivre
- Compteur d'abonnés
- Publication texte / image / vidéo
- Réactions avec persistance
- Commentaires avec persistance
- Partage persistant dans `page_post_shares`
- Suppression/modération des publications selon le rôle
- Gestionnaire Page: owner / admin / editor
- Ajout, changement de rôle et retrait d'un gestionnaire
- Messagerie visiteur → Page + réponse propriétaire/admin
- Realtime des publications, réactions, commentaires, partages, followers, membres et messages
- RLS Supabase + indexes + compteurs automatiques

## SQL
Exécuter une seule fois après `TAFASS_FINAL_COMPLETE_REALTIME.sql`:
`PAGE_PREMIUM_REALTIME.sql`

Le SQL est idempotent: aucune table n'est supprimée et aucune donnée n'est effacée.
