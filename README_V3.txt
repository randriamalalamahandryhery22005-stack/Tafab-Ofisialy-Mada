Tafaß — Publication / Live / Auth v3

Fichiers modifiés:
- app.js
- style.css
- TAFASS_LIVE_PUBLICATION_V3.sql

À faire:
1. Remplacer app.js et style.css dans le projet Tafaß.
2. Exécuter TAFASS_LIVE_PUBLICATION_V3.sql dans Supabase SQL Editor.
3. Le Live utilise la caméra/micro du navigateur + WebRTC et Supabase Realtime pour le signalement.
4. Le Live nécessite HTTPS (ou localhost) et l'autorisation caméra/microphone.
5. Le live actif apparaît dans Actualités et sur le profil du diffuseur. Quand il est terminé, son statut passe à ended et les indicateurs disparaissent.

Important:
- Le mode amis est maintenant réellement filtré par la table friendships.
- Les légendes longues sont repliées par défaut avec Voir plus / Voir moins.
- Le sélecteur Public/Amis/Moi uniquement est relié à visibility.
