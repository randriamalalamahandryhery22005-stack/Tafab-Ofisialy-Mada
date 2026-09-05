# Tafaß — Admin Total

Le compte `herymahandry04@gmail.com` est la cible de l'administration totale.

## Installation

1. Ouvrir Supabase → SQL Editor.
2. Ouvrir `TAFASS_ADMIN_TOTAL_HERYMAHANDRY.sql`.
3. Exécuter le script avec les droits postgres.
4. La dernière requête doit retourner le compte avec `role = super_admin`.
5. Déconnecter/reconnecter le compte dans Tafaß pour recharger les permissions.

Le script est idempotent et ne supprime aucune donnée utilisateur, publication, message ou notification.
