# TAFAß — Pages & Groupes Premium Final

Cette version modernise les espaces **Pages** et **Groupes** avec une interface premium mobile-first et des actions réellement reliées à Supabase.

## Fonctionnalités

### Pages
- identité : avatar/logo, couverture, nom, @username, catégorie, bio
- abonnements réels (`page_followers`)
- publications texte + image + vidéo (`page_posts`)
- réactions, commentaires, partages persistants
- compteurs et rafraîchissement Realtime
- owner / administrateur / éditeur
- ajout, changement de rôle et retrait des gestionnaires
- modification des informations et visuels
- contact de la Page + inbox propriétaire
- onglets Publications / À propos / Équipe

### Groupes
- identité : avatar, couverture, nom, description, public/privé
- rejoindre / quitter réellement (`group_members`)
- publications texte + image + vidéo (`group_posts`)
- réactions, commentaires, partages persistants
- membres + rôles
- invitation directe par username/e-mail
- gestion du groupe par le propriétaire
- discussion de groupe avec historique et Realtime
- onglets Publications / Membres / À propos

## Supabase

1. Le schéma principal Tafaß doit déjà être installé.
2. Exécuter **TAFASS_PAGES_GROUPS_PREMIUM_COMPLETE.sql** une seule fois.
3. Ce SQL est idempotent, ajoute les GRANT PostgreSQL nécessaires et ne supprime pas les données.
4. Le bucket `posts` existant est utilisé pour les médias.

Résultat attendu :

`TAFAß PAGES + GROUPES PREMIUM COMPLETE REALTIME READY`

## Realtime

Les tables Page/Groupes sont ajoutées à `supabase_realtime` de manière duplicate-safe avec `REPLICA IDENTITY FULL`.
