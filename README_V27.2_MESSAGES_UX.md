# Tafaß V27.2 — Messages UX & Privacy

## Nouveautés
- Marqueur visible lorsqu'un message est supprimé pour tout le monde, sans supprimer la ligne de conversation.
- Confirmation Annuler / Oui avant « Supprimer pour tout le monde ».
- Confirmation Annuler / Oui avant suppression d'une conversation pour soi.
- Historique des anciennes versions d'un message modifié, accessible via « modifié ».
- Thèmes de fond personnalisables par conversation et par utilisateur : Classique, Amoureux, Triste, Heureux, Enemies, Nature, Océan, Nuit.
- Suppression pour tout le monde désormais en soft-delete sécurisé via RPC : contenu et média retirés, marqueur conservé.
- Historique de modification enregistré côté serveur via RPC sécurisé.

## Supabase
Exécuter `TAFASS_MESSAGES_V27_COMPLETE.sql` une fois. Le script est additif et utilise `IF NOT EXISTS` / `CREATE OR REPLACE`; il ne supprime pas les données existantes.
