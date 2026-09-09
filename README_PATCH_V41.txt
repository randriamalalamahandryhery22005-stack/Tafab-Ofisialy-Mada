# Tafaß V41 — Patch uniquement

Ce ZIP contient uniquement les fichiers ajoutés/modifiés pour le correctif demandé.

## Fichiers
- `app.js` — règle 18+, nouveau parcours Badge officiel en 4 étapes, fallback robuste Suivre/Rejoindre, transitions de connexion/déconnexion, ouverture du Menu non bloquante.
- `index.html` — nouveau Splash sans texte, logo + loading points, cache-busting V141.
- `style.css` — nouvelle interface Premium Pages/Groupes, Limites mises en valeur, Splash points et écrans de chargement.
- `TAFASS_V41_PREMIUM_FIXES.sql` — correctifs backend pour Suivre/Rejoindre et nouveau workflow Badge officiel.

## Installation
1. Remplacer les 3 fichiers frontend à la racine du projet par ceux de ce patch.
2. Exécuter `TAFASS_V41_PREMIUM_FIXES.sql` dans Supabase SQL Editor.
3. Vider le cache du navigateur/PWA puis recharger.
4. Pour le Badge officiel, le nouveau bouton est `Badge officiel` dans Menu et lance le parcours en 4 étapes.

Les données existantes ne sont pas supprimées par le patch SQL.
