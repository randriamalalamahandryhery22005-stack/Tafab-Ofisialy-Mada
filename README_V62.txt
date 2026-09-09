Tafaß V62 — Gestion du temps adaptée à l’âge

Modifications :
- Comptes de moins de 18 ans : rappel 15 min, second avertissement 30 min, déconnexion automatique 45 min.
- Comptes de 18 ans ou plus : rappel 30 min, second avertissement 60 min (1 h), déconnexion automatique 90 min (1 h 30).
- Affichage dynamique de la tranche d’âge et des paliers dans l’interface Limites.
- Le compteur reste basé sur le temps réellement passé au premier plan.
- La clé de session est séparée par politique d’âge pour éviter qu’un ancien palier ne soit réutilisé avec une autre politique.
- Cache applicatif v163 + Service Worker V62.
- Aucun SQL nouveau requis.

Patch-only : uniquement les fichiers modifiés/ajoutés sont inclus.
Validation : app.js vérifié avec Node.js --check.
