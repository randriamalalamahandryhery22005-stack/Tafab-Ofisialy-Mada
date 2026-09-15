TAFAß V99 CLEAN — MENU / ADMIN CLEANUP

Fichiers modifiés uniquement :
- app.js
- style.css

Corrections :
- Menu redesigné en interface premium/avancée et responsive.
- Monétisation retirée du Menu et du tableau Administration.
- Tafaß Music retiré du Menu et rendu non routable.
- Anciennes routes creator/music redirigées vers Menu.
- Anciens fragments UI de monétisation/Music supprimés au chargement du Menu.
- Anciennes clés de build UI nettoyées du localStorage puis V99-CLEAN devient le build actif.
- Les données Supabase et la logique métier existante ne sont pas supprimées/modifiées par ce patch.
- Les anciens fichiers frontend ne doivent plus être chargés en parallèle avec ce V99.
