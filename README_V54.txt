Tafaß V54 — Page End / No Empty Scroll Tail

Modifications :
- Réduction de l’espace vide après le dernier élément de chaque page.
- Suppression des réserves excessives de 112–118px qui créaient une longue zone vide.
- Desktop : marge finale compacte.
- Mobile : espace final limité à la hauteur réellement nécessaire pour la barre de navigation fixe.
- Ajustement spécifique des petits écrans.
- Admin / Profil / pages clean : padding final également réduit.
- Cache applicatif v155.
- Service Worker passé sur le shell V54.
- Aucun SQL nouveau.

Patch-only : uniquement les fichiers modifiés/ajoutés sont inclus.
Validation : app.js vérifié avec Node.js --check.
