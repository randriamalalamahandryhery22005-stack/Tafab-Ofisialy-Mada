TAFAß V40 — PATCH CIBLÉ

Fichiers modifiés / ajoutés uniquement :
- app.js
- style.css
- index.html
- sw.js
- TAFASS_V40_LIMITES_PAGES_GROUPES_VERIFICATION.sql

Fonctions incluses :
1. Page — Suivre / Suivie : RPC sécurisé + fallback client.
2. Groupe — Rejoindre / Membre / Quitter : RPC sécurisé + gestion des groupes privés.
3. Nouvelle interface premium pour les Pages et les Groupes (hub + détail).
4. Gestion du temps :
   - 13 ans et plus : rappel à 30 min, second rappel à 60 min, déconnexion automatique à 90 min.
   - moins de 13 ans si un ancien compte possède une date de naissance correspondante : 15 / 30 / 45 min.
   - le compteur mesure le temps au premier plan et ne compte pas l’arrière-plan.
   - le compte administrateur officiel est exempté.
   - explication affichée avant l’entrée dans l’application.
   - rappel affiché au-dessus de l’interface, où que l’utilisateur se trouve.
   - déconnexion manuelle possible à chaque rappel.
5. Paramètres → Gestion du temps : règles visibles et non ambiguës.
6. Navigation mobile : l’emplacement Tafaß est remplacé par Reels.
7. Vérification badge bleu : frontend aligné sur tafa_verification_requests + RPC de création + RPC admin + realtime + stockage privé.

IMPORTANT : exécuter une seule fois le fichier SQL V40 dans Supabase → SQL Editor avant de tester Follow, Rejoindre et Vérification.

Le ZIP ne contient pas tout le projet : uniquement les fichiers nécessaires à cette mise à jour.
