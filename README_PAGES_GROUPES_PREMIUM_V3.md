# Tafaß — Pages & Groupes Premium V3

## UI
- Page: 3 statistiques sous l'identité — Abonnés / Publications / Catégorie.
- Actions fixes: Suivre à gauche, Messages au centre, ••• à droite.
- Menu •••: inviter des amis, partager, copier le lien, gérer (owner/admin), signaler.
- Mobile-first: aucun chevauchement volontaire, boutons dimensionnés, cartes premium, tabs scrollables.
- Groupes: membres, publications, discussion, invitation, gestion admin.

## Permissions
### Page
- Owner + admin: gestion complète et publication au nom de la Page.
- Editor: ne peut plus publier ni modifier la Page.
- Membres/visiteurs: suivre, contacter, interagir avec les publications publiques.

### Groupe
- Admin: modifications complètes du groupe et gestion des membres.
- Membre: publier, commenter/réagir et inviter ses amis.
- Les invitations de groupe sont envoyées comme notifications; le destinataire rejoint ensuite le groupe.

## SQL
Run once in Supabase:
`TAFASS_PAGES_GROUPS_PREMIUM_ROLES_FIX.sql`

No DROP TABLE and no DELETE are used by this migration.
