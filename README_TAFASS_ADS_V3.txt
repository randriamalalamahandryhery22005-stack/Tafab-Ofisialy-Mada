TAFAß ADS V3 — OWNER DASHBOARD + ADMIN TOTAL

Fichiers modifiés :
- app.js
- style.css
- TAFASS_ADS_V2_DASHBOARD_ADMIN.sql

Installation :
1. Remplacer uniquement app.js et style.css.
2. Exécuter TAFASS_ADS_V2_DASHBOARD_ADMIN.sql dans Supabase SQL Editor.
3. Recharger le schéma PostgREST si nécessaire (la migration envoie NOTIFY pgrst).
4. Redéployer l'application.

Fonctionnalités :
- Chaque campagne Boost possède son propre tableau de bord propriétaire.
- Statistiques serveur : impressions, portée unique, clics, clics uniques, CTR et dernière activité.
- Évolution quotidienne sur 14 jours.
- Budget total, dépense et montant restant.
- Historique du dernier paiement.
- Marque TAFAß ADS · SPONSORISÉ visible pendant toute la diffusion.
- Le propriétaire peut mettre une campagne active en pause, mais ne peut pas la forcer en active.
- L'administration peut contrôler toutes les campagnes : activer, mettre en pause, refuser ou terminer.
- Les paiements et campagnes restent contrôlés côté serveur.
- Realtime sur les événements publicitaires pour actualiser le tableau de bord.

Important :
- Ne pas supprimer les tables Ads existantes.
- Le ciblage utilise uniquement les données disponibles dans Tafaß.
- Les statistiques sont réelles uniquement à partir des événements enregistrés par le serveur.
- Le paiement automatique opérateur nécessite toujours l'API / compte marchand officiel correspondant.
