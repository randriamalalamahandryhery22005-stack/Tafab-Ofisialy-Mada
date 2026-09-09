Tafaß V53.1 — Single Version & Duplicate Cleanup

Modifications :
- Un seul build frontend actif : TAFAß-V53.1.
- Nettoyage automatique des anciens caches Tafaß laissés par les anciennes versions.
- Service Worker remplacé par un shell V53.1 unique et cache-busting v154.
- Les anciennes versions ne sont plus conservées comme cache offline.
- Déduplication préventive des balises app.js/style.css si elles apparaissent plusieurs fois dans le DOM.
- Cache applicatif : v154.
- Aucun nouveau SQL requis.
- Les données Supabase ne sont pas supprimées automatiquement : aucune suppression destructive de données n'est faite.

Patch-only : uniquement les fichiers modifiés/ajoutés sont inclus.
Validation : app.js vérifié avec Node.js --check.
