# Tafaß — nouveau frontend

Contenu:
- index.html
- app.js
- style.css

Le frontend utilise Supabase Auth, Database, Storage et Realtime.
Il réutilise le schéma Supabase déjà en place; aucun nouveau SQL n'est inclus ici.

Fonctionnalités UI:
Splash, Auth, Actualités/feed, publication texte/photo/vidéo, réactions 7 types,
commentaires, partage, Amis, Recherche, Profil, Notifications, Messages,
Vidéos, Reels, Pages, Groupes, Enregistrements, Menu, Paramètres, thème sombre,
responsive Android/iPhone/desktop et Realtime.

Important:
- Le bucket Storage `posts` doit exister et être public/autorisé selon votre configuration existante.
- Les RPC existantes `tafa_set_post_reaction` et `tafa_increment_post_share` sont utilisées.
- La table `friend_requests` est utilisée pour les invitations.
- Si Supabase Auth exige la confirmation e-mail, l'utilisateur doit confirmer son adresse avant connexion.
