# Tafaß V82 — Pages UI Rebuild

## Fichiers modifiés
- `app.js`
- `style.css`

## Ce qui change
- Nouvelle interface Pages V82, mobile-first.
- L'ancienne interface Page V80/V65 n'est plus utilisée pour le hub et le détail.
- Le détail d'une Page utilise maintenant une vraie zone de défilement verticale interne.
- Défilement haut/bas fonctionnel au tactile, avec inertie mobile.
- Barre supérieure et onglets restent accessibles pendant le défilement.
- Boutons Suivre, Basculer, Gérer, Messages, Options, Publier, Commenter, Partager et Équipe conservent les actions existantes.
- Les données Supabase existantes (`pages`, `page_followers`, `page_members`, `page_posts`) sont conservées.
- Aucun reset ni suppression des données Page.
- Interface V82 indépendante des anciens styles verts/orange de l'ancienne Page.

## Installation
Remplacer uniquement les deux fichiers suivants dans le projet :
1. `app.js`
2. `style.css`

Le README peut rester dans le projet ou être supprimé après installation.

## Vérification
- `node --check app.js` : OK
