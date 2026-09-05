# Tafaß V23 — Events + Creator Studio

Ajouts principaux:
- Évènements publics/privés avec création, détails et RSVP (Je participe / Intéressé).
- Liste des participants et synchronisation Realtime.
- Creator Studio avec dashboard de base, brouillons, types post/vidéo/reel/story et programmation.
- Tables Supabase: `tafab_events`, `tafab_event_attendees`, `tafab_creator_drafts`.

## Installation Supabase
Exécuter une seule fois `TAFASS_V23_EVENTS_CREATOR_STUDIO.sql` dans Supabase SQL Editor.

Le SQL est idempotent et recharge le cache PostgREST.
