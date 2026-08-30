# TAFAß — Pages & Groupes Premium Final V2

Cette version corrige la présentation mobile et branche les actions principales aux tables Supabase.

## Pages
- profil Page premium: couverture, logo, badge, identité, statistiques et onglets
- publication texte / image / vidéo vers `page_posts`
- réactions vers `page_post_reactions`
- commentaires vers `page_post_comments`
- partage vers `page_post_shares`
- suivi via `page_followers`
- contact de la Page via `page_messages`
- inbox propriétaire via `page_messages`
- gestionnaires et rôles via `page_members`
- édition des informations et médias
- realtime sur les tables Page

## Groupes
- couverture, avatar, confidentialité, statistiques et onglets
- rejoindre / quitter
- publication texte / image / vidéo vers `group_posts`
- réactions via `group_post_reactions`
- commentaires via `group_post_comments`
- partage via `group_post_shares`
- discussion via `group_messages`
- membres et rôles
- gestion du groupe
- realtime sur les tables Groupe

## Mobile / responsive
- suppression des débordements horizontaux
- boutons et statistiques réorganisés pour petits écrans
- onglets scrollables sans collision
- média et texte contenus dans les cartes
- footer d'actions stable
- modales Page/Groupe plein écran sur mobile

## SQL
Utiliser `TAFASS_PAGES_GROUPS_PREMIUM_COMPLETE.sql` après le schéma principal déjà installé.
Le SQL est idempotent, renforce les GRANT, RLS/Realtime existants et ajoute les triggers de compteurs des publications Page.
