# Tafaß — version réelle

Cette version utilise Supabase comme source de données et de temps réel.

## Mise à jour V12

Exécuter `TAFASS_V12_REAL_SOCIAL.sql` dans Supabase **après** les SQL déjà présents (`TAFASS_NEW_PROJECT.sql`, `TAFASS_V10_PROFILE_ACTUALITES.sql` et `TAFASS_V11_REACTIONS.sql`).

La V12 ajoute notamment :
- profil public : Ajouter, Messages, options de compte ;
- signalement et blocage de comptes ;
- conversations privées A ↔ B avec messages et lecture en temps réel ;
- alertes automatiques pour réactions, commentaires, partages, demandes/acceptations d'amis, messages, abonnements, Pages et groupes ;
- recherche de comptes et de publications réelles ;
- historique d'activité réel ;
- enregistrement des demandes de paiement Airtel Money / Yas Money sans simuler un paiement ;
- synchronisation Realtime des principales tables sociales.

Aucun jeu de données de démonstration n'est ajouté.
