# Tafaß V71 — Profil premium + navigation fluide

Patch uniquement basé sur V70.

## Modifications
- Profils publics refaits sur la structure des références : état ami / non-ami.
- Ami : bouton `Ami(e)s`, `Message` premium, options.
- Non-ami : `Ajouter comme ami(e)` + `Message`, publications protégées jusqu’à l’ajout.
- PDP : cercle réel partout avec `object-fit: cover`.
- Amis communs et liste d’amis avec avatars ronds.
- Profil propre : couverture, PDP, identité, informations, amis, publications.
- Ouverture des profils : requêtes Supabase indépendantes parallélisées.
- Publications du profil rendues en parallèle pour réduire l’attente.
- Navigation : les boutons de route restent cliquables pendant le chargement ; un chargement lent ne bloque plus les taps.
- Cache actif V71 uniquement ; les anciens caches Tafaß sont supprimés à l’activation du Service Worker.

## Fichiers
- `app.js`
- `style.css`
- `index.html`
- `sw.js`

Aucun SQL n’est nécessaire pour ce patch.
