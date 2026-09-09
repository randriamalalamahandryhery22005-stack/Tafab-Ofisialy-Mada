Tafaß V61 — Para & Conf Single Version Cleanup

Modifications :
- Suppression du ancien dashboard Para & Conf V52 qui créait un doublon avec l’interface Premium V60.
- V60 devient la seule interface active pour Paramètres & confidentialité.
- Nettoyage de tout ancien bloc V52 restant dans le DOM après un cache/reload.
- Protection anti-retour de l’ancien écran lors d’un hot reload.
- Cache applicatif v162 + Service Worker V61.
- Aucun SQL nouveau.

Patch-only : uniquement les fichiers modifiés/ajoutés sont inclus.
Validation : app.js vérifié avec Node.js --check.
