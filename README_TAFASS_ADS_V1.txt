TAFAß ADS V1 — BOOST PREMIUM

Fichiers modifiés :
- app.js
- style.css
- TAFASS_ADS_V1_PREMIUM_REAL_BOOST.sql

Installation :
1. Remplacer uniquement app.js et style.css dans le projet.
2. Exécuter TAFASS_ADS_V1_PREMIUM_REAL_BOOST.sql dans Supabase SQL Editor.
3. Recharger/redeploy l'application.

Flux :
Publication → Booster / Sponsoriser → ciblage âge/genre/localisation → budget → paiement → vérification Admin → validation Admin → Sponsorisé dans le fil → impressions/clics/statistiques.

Page :
Business & Publicité → Promouvoir une Page → ciblage → budget → paiement → validation Admin → Page sponsorisée.

Paiement V1 :
Airtel Money / Yas Money avec référence de transaction et vérification administrative. L'activation automatique via API d'un opérateur nécessite ensuite les identifiants/API marchands officiels de Tafaß ; aucune fausse confirmation de paiement n'est générée.

Sécurité :
Les transitions sensibles (paiement vérifié, activation sponsorisée et diffusion) passent par des fonctions SECURITY DEFINER contrôlées côté serveur. Le propriétaire ne peut pas forcer une campagne en active directement.

Important :
Le ciblage actuel utilise uniquement les données réellement disponibles dans profiles : pays/localisation, date de naissance et genre. Le ciblage par centres d'intérêt sera ajouté lorsqu'un champ/source de centres d'intérêt fiable existe dans le schéma Tafaß.
