Tafaß V53 — Profile Reports RLS Hotfix

Modifications :
- Correction du signalement de profil : suppression du flux upsert qui pouvait déclencher une UPDATE RLS interdite.
- Le signalement utilise désormais un INSERT sécurisé uniquement.
- Message propre en cas de signalement déjà existant (23505).
- Ajout du SQL de correction RLS pour public.profile_reports : INSERT limité à reporter_id = auth.uid().
- Lecture limitée aux propres signalements côté utilisateur.
- Support Realtime de profile_reports + rechargement du cache PostgREST.
- Cache applicatif v153.

Patch-only : uniquement les fichiers modifiés/ajoutés sont inclus.
Validation : app.js vérifié avec Node.js --check.

Important : exécuter TAFAß_V53_PROFILE_REPORTS_RLS.sql dans Supabase SQL Editor une seule fois.
