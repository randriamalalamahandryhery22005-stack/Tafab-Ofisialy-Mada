# Tafaß FINAL — Blocage global, auto-save, publication premium, paiement

## Changements
- Blocage bilatéral : profils, recherche, publications, réactions, commentaires, partages, demandes d'amis, relations, suivi et messages sont bloqués.
- Suppression des relations existantes au moment du blocage.
- Contrôles DB supplémentaires via `TAFASS_BLOCKING_GLOBAL_ENFORCEMENT.sql`.
- Auto-enregistrement des paramètres sans quitter la sous-section.
- Déconnexion fonctionnelle via `Supabase auth.signOut()` avec confirmation.
- Compositeur Actualités premium : Story, Texte, Photo, Vidéo, Humeur et Plus.
- Humeur avancée avec choix et texte complémentaire.
- Paiement : interface en 3 étapes visuelles, montant, numéro, méthode Airtel Money/Yas Money, confirmation et statut pending. Aucun lien de l'application n'est affiché.
