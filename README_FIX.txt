TAFAß — FIX DEMANDE DE RÉACTIVATION

Le message « duplicate key ... tafa_account_appeals_one_pending_per_user_idx » ne vient pas de l'approbation admin. Il vient d'une nouvelle insertion de demande alors qu'une demande pending existe déjà.

Ce patch app.js :
- bloque les doubles clics sur « Envoyer la demande » ;
- vérifie directement dans Supabase s'il existe déjà une demande pending ;
- masque le formulaire lorsqu'une demande pending existe ;
- transforme aussi l'erreur unique en message utilisateur propre ;
- ne supprime pas la contrainte « une seule demande pending par compte » ;
- ne modifie pas avatar_url/cover_url.

Installation : remplacer uniquement app.js.
Ne pas supprimer l'index unique.
