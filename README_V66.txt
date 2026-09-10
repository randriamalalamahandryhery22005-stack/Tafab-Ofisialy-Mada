Tafaß V66 — Navigation Page / Menu Stable

Modifications :
- En mode Page, suppression complète de « Amis » de la navigation.
- Ajout de « Menu » dans la navigation Page, à une position stable.
- Navigation Page dédiée : Actualités, Messages, Alertes, Reels, Pages, Menu.
- Navigation du compte normal conservée : Actualités, Amis, Messages, Pages, Groupes, Reels.
- Le passage Compte ↔ Page ne remplace plus la navigation de façon imprévisible.
- Une seule version de navigation Page est autorisée et réappliquée après les rafraîchissements UI.
- Reels reste présent en mode Page et en mode compte.
- Aucun SQL nouveau.
- Cache applicatif v166.
- Service Worker V66 supprime les anciens caches lors de l’activation.

Patch-only : uniquement les fichiers modifiés/ajoutés sont inclus.
Validation : app.js vérifié avec Node.js --check.
