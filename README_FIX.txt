TAFAß — FIX FINAL « APPROUVER & RÉACTIVER »

1. Remplacer uniquement app.js par celui de ce ZIP.
2. Dans Supabase > SQL Editor, exécuter :
   TAFASS_REACTIVATION_APPROVAL_TRIGGER_FIX.sql
3. Ne pas supprimer l'index unique tafa_account_appeals_one_pending_per_user_idx.
4. Tester avec la demande actuellement « En attente ».

Ce correctif permet à l'administrateur de modifier account_status d'un compte
restreint sans que le trigger de protection ne bloque l'opération.
Le avatar_url (PDP) et cover_url (PDC) ne sont pas modifiés lors de l'approbation.
