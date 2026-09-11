# Tafaß V79 — Profil Realtime & Save Fix

Base: V78.

## Corrections
- `Ville d'origine` is now optional; it no longer blocks saving the profile.
- Profile changes are written with one confirmed database update and immediately applied to local state.
- The save operation verifies the row returned by Supabase before closing the editor.
- `bio`, current city, origin city, avatar and cover are synchronized immediately after save.
- Realtime publication for `profiles` is ensured by SQL.
- Own-profile UPDATE RLS policy is added only if it does not already exist.
- `updated_at` is refreshed automatically by a database trigger.
- Public profile avatar clipping is reinforced so every account uses a true circular PDP container.

## SQL
Run `TAFASS_V79_PROFILE_REALTIME.sql` in Supabase SQL Editor.

No full project is included; this is a patch-only release.
