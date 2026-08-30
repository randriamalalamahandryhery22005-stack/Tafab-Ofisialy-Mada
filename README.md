# Tafaß — Supabase Realtime V4

Version corrigée du projet Tafaß.

- Correction RLS : suppression de la récursion infinie sur `conversation_members` et `group_members`.
- Messages : conversations et messages réellement liés à l'utilisateur connecté.
- Realtime : tables principales configurées pour Supabase Realtime.
- Tafaß : aucune annonce de démonstration créée automatiquement ; les offres/publicités sont des données Supabase réelles.
- Profil : compteurs Amis/Abonnés et informations venant de Supabase, sans valeurs fictives.
- Interface : navigation premium, notamment Actualités, Amis, Messages, Alertes, Tafaß, Menu et Profil.
- Mobile : le bouton inférieur `Tafaß` reste Tafaß ; `Menu` est accessible depuis le bouton menu supérieur/latéral.

## SQL
Exécuter `TAFASS_NEW_PROJECT.sql` dans Supabase SQL Editor.
Le script est prévu pour être relancé sans supprimer les tables ni les données.


## Actualités V6
Actualités connectée à Supabase : publications, réactions, commentaires et partages réels avec synchronisation Realtime. Aucun contenu de démonstration n'est généré par l'interface.
