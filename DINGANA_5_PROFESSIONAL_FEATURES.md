# Tafaß — Dingana 5 : Professional Features

Date : 2026-09-11

## Objectif
Ajouter une amélioration professionnelle utile sans modifier le backend existant : récupération automatique des brouillons de publication.

## Modification
- `app.js` uniquement.
- Le texte, l'audience, le fond, le lieu et les métadonnées du composeur sont conservés localement par utilisateur.
- Le brouillon est enregistré automatiquement après la saisie avec un petit délai pour éviter des écritures répétées.
- Un brouillon est restauré à la réouverture du composeur.
- Les brouillons expirent après 7 jours.
- Le fichier photo/vidéo n'est jamais stocké dans localStorage ; il doit être resélectionné.
- Le brouillon est supprimé après publication réussie.

## Compatibilité
- Aucun changement de tables ou de schéma Supabase.
- Aucun changement de RLS, Auth ou Realtime.
- Aucun nouveau secret.
- `node --check app.js` : PASS.

## ZIP
Ce ZIP contient uniquement les fichiers modifiés/ajoutés pour cette étape.
