Tafaß V59 — Badge Officiel • Zero-Wait / Stable Premium

Correction principale :
- La page Vérification s'affiche immédiatement sans attendre Supabase.
- Suppression du chargement pouvant rester bloqué indéfiniment.
- Lecture des tables tafa_verification_requests et badge_requests en parallèle.
- Timeout court et état de récupération si le serveur est lent.
- Conservation du RPC de demande de badge et du fallback badge_requests.
- Interface Badge Officiel Premium responsive.
- Cache applicatif v160 + nouveau cache Service Worker V59.
- Aucun SQL nouveau requis.

Patch-only : uniquement les fichiers modifiés/ajoutés sont inclus.
Validation : app.js vérifié avec Node.js --check.
