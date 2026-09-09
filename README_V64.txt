Tafaß V64 — Navigation Stable & Scroll Fix

Modifications :
- Navigation mobile stable : une seule structure, conservée après l’ouverture d’une Page et au retour au compte normal.
- Reels reste toujours présent dans la barre de navigation.
- Le mode Page ne remplace plus le DOM de navigation ; il change uniquement l’identité affichée.
- Suppression visuelle des anciennes couches de navigation V50/V51.
- Correction du scroll global : la page principale redevient normalement défilable de haut en bas et de bas en haut.
- Seuls les composants qui doivent réellement défiler gardent leur scroll interne (messages, modales, listes dédiées).
- Correction du cache stylesheet/app : v165.
- Service Worker V64 supprime les anciens caches et conserve uniquement le shell actif.
- Aucun SQL nouveau.

Patch-only : uniquement les fichiers modifiés/ajoutés sont inclus.
Validation : app.js vérifié avec Node.js --check.
