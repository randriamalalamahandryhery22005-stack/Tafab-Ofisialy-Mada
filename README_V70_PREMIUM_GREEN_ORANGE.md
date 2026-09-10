# Tafaß V70 — Premium Green × Orange / Profil + stabilité

Base: **Tafaß V69 Badge Bleu + Papi**.

## Fichiers de ce patch
- `app.js` — build V70, profil premium mobile inspiré de la maquette fournie, navigation propre, thème des conversations synchronisé, suppression des boutons d'appel/vidéo non implémentés.
- `style.css` — skin unique sombre vert/orange/or et nouveau profil.
- `index.html` — cache-bust V170 + thème sombre.
- `sw.js` — nouveau cache `tafass-v70-premium-shell` et purge des anciens caches Tafaß.
- `TAFASS_V70_THEME.sql` — table/RPC des thèmes de conversation + Realtime.

## Installation
1. Garder la base V69 et son SQL `TAFASS_V69_BADGE_PAPI.sql` déjà exécuté.
2. Copier uniquement les fichiers de ce patch dans le projet en remplaçant les fichiers correspondants.
3. Exécuter `TAFASS_V70_THEME.sql` dans Supabase SQL Editor.
4. Déployer normalement l'application.
5. Sur Android/WebView, recharger une fois l'application afin que le service worker V70 supprime les anciens caches.

## Profil V70
- Couverture + PDP superposée comme la référence.
- Boutons `Ajouter à la story` et `Modifier le profil` réellement reliés aux fonctions existantes.
- Onglets fonctionnels: `Tous`, `Photos`, `Reels`, `Amis`.
- Informations personnelles, amis, publications et navigation conservés.
- Les informations privées restent dans `Paramètres → Informations du profil`.

## Thèmes des conversations
Six thèmes: Émeraude, Sunset, Gold, Forêt, Amour, Minuit.
Le RPC `tafa_set_conversation_theme` applique le choix aux membres de la conversation. Realtime permet à l'autre compte de voir le changement sans attendre un refresh manuel.

## Contrôle de qualité
- `node --check app.js` doit passer avant livraison.
- Le patch ne contient pas le projet complet: uniquement les fichiers modifiés/ajoutés.
