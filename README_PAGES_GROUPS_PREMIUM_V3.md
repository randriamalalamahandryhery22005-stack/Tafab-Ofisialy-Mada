# Tafaß — Pages & Groupes Premium V3

## Règles métier

### Page
- Le propriétaire est le seul à pouvoir publier **au nom de la Page**.
- Le propriétaire et les administrateurs peuvent modifier/gérer la Page.
- Les autres utilisateurs peuvent suivre, contacter, commenter/réagir aux publications publiques et partager.
- Le bouton `•••` ouvre le menu complet : inviter des amis à suivre, partager la Page, copier le nom et signaler.
- Barre d'action mobile : `Suivre` / `Messages` / `•••`.

### Groupe
- Les membres peuvent publier et inviter leurs amis.
- Le propriétaire et les administrateurs peuvent modifier le groupe et gérer les membres/rôles.
- Les membres peuvent rejoindre/quitter (le propriétaire ne peut pas quitter son propre groupe).
- Discussion du groupe et publications utilisent Supabase.

## Realtime / sécurité

Le SQL `TAFASS_PAGES_GROUPS_PREMIUM_COMPLETE_V3.sql` :
- corrige les privilèges `authenticated` ;
- limite la publication Page au propriétaire ;
- autorise les administrateurs Page à gérer la Page ;
- autorise les administrateurs Groupe à gérer le groupe et ses membres ;
- conserve RLS ;
- conserve Realtime idempotent ;
- ne supprime aucune donnée existante.
