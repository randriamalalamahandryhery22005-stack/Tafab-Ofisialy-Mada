# Tafaß V78 — Admin Single Version

Cette version supprime visuellement les anciennes présentations Admin V50/V51/V63/V75 et garde une seule présentation Admin autoritaire.

## Changements
- Tableau de bord Admin unique.
- Comptes utilisateurs présentés dans un tableau stable et responsive.
- Action `Gérer` pour chaque compte.
- Admin peut : Activer, Restreindre, Bloquer ou Supprimer définitivement un compte.
- Suppression préférentielle via `auth.users`; si une ancienne contrainte FK empêche la suppression physique, le compte est anonymisé et marqué `deleted` côté profil.
- Un compte Admin ne peut pas être supprimé/modifié par cette interface.
- Les publications écrites via « Écrivez quelque chose… » disparaissent immédiatement après suppression et les éléments `deleted` ne sont plus affichés.
- Synchronisation de l’identité d’inscription depuis `auth.users.raw_user_meta_data` pour éviter le retour de « Membre Tafaß » lorsque le nom a été fourni.

## SQL
Exécuter `TAFASS_V78_ADMIN_SINGLE_VERSION.sql` après les SQL précédents.

## Vérification
`node --check app.js` doit passer avant déploiement.
