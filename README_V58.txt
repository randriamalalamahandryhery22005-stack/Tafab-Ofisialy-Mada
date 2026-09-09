Tafaß V58 — Badge Officiel / Vérification Stable Premium

Modifications :
- Correction du blocage sur « Vérification du compte » : affichage immédiat de la page.
- Timeout réseau pour éviter un chargement infini.
- Lecture robuste de tafa_verification_requests avec fallback badge_requests.
- Soumission RPC conservée en priorité, avec fallback sécurisé vers badge_requests si le RPC est indisponible.
- Protection contre les demandes pending en double.
- Interface Badge officiel premium Black + Green + Orange + Gold.
- Statut, parcours, sécurité et action présentés dans une interface moderne et responsive.
- Cache applicatif v159 + Service Worker V58.
- Aucun nouveau SQL obligatoire.

Patch-only : uniquement les fichiers modifiés/ajoutés sont inclus.
Validation : app.js vérifié avec Node.js --check.
