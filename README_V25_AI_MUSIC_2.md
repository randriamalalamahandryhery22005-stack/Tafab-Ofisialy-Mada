# Tafaß V25 — AI + Music 2.0

Cette version ajoute deux espaces majeurs sans supprimer les fonctionnalités existantes :

## Tafaß AI
- Assistant, rédaction, traduction et résumé.
- Historique privé par utilisateur.
- Aucun secret AI dans le frontend.
- L’endpoint doit être une Edge Function/API sécurisée via `window.TAFASS_AI_ENDPOINT`.
- Si aucun endpoint n’est configuré, l’application affiche clairement que le service n’est pas configuré au lieu de simuler une réponse.

## Tafaß Music 2.0
- Catalogue serveur artistes/pistes/albums.
- Likes et favoris de pistes.
- Playlists privées/publiques.
- Compteur d’écoutes atomique via RPC.
- Realtime sur catalogue/likes/playlists.
- Compatible avec le Music Lab généré déjà présent dans Tafaß pour les pistes sans `audio_url`.

## Activation Supabase
Exécuter une seule fois : `TAFASS_V25_AI_MUSIC_2.sql` dans Supabase SQL Editor.

Ne jamais mettre une clé API AI secrète dans `app.js`, `index.html` ou le ZIP. Utiliser une Edge Function côté serveur pour appeler le fournisseur AI.
