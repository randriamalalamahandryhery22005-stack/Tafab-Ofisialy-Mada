Tafaß — Admin Dashboard final SQL fix

Utiliser uniquement les deux fichiers SQL de cette archive pour le Dashboard Admin.
Cette version :
- ne référence plus la colonne is_reel ;
- utilise posts.media_type = 'reel' pour compter les Reels ;
- ne supprime pas tafa_is_admin(uuid) ;
- n'utilise pas DROP FUNCTION ... CASCADE ;
- conserve les policies RLS existantes.

Exécuter TAFASS_ADMIN_DASHBOARD_REALTIME.sql puis TAFASS_ADMIN_DASHBOARD_FINAL_FIX.sql.
