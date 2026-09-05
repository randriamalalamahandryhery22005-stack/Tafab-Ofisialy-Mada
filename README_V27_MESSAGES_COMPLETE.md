# Tafaß V27 — Messages 2.0

## Ajouté
- Appui long sur un message/conversation pour ouvrir les options.
- Message: répondre, modifier (auteur), supprimer pour moi, supprimer pour tout le monde (auteur), réaction, copier.
- Réactions rapides: ❤️ 😂 😮 😢 👍.
- Vocal: enregistrement → écoute avant envoi → supprimer/réenregistrer ou envoyer.
- Upload image/vidéo/fichier avec indicateur de progression visuel.
- Téléchargement de tous les médias/fichiers reçus.
- Appui long sur une conversation: supprimer pour moi, bloquer les messages, bloquer partout.
- Tables additives avec RLS: `tafab_message_hidden`, `tafab_message_reactions`, `tafab_deleted_conversations`, `tafab_message_blocks`.

## Installation
Exécuter `TAFASS_MESSAGES_V27_COMPLETE.sql` une seule fois dans Supabase SQL Editor.

Aucune clé secrète n'est requise côté frontend.
