# Tafaß V74.1 — SQL Fix

Correction de l'erreur PostgreSQL `42703: column p.role does not exist`.

## Correction
- `tafa_v74_is_admin()` utilise uniquement `profiles.is_admin`.
- `tafa_v74_reward_admin()` utilise uniquement `profiles.is_admin`.
- Le tri de l'admin ne dépend plus de `profiles.created_at`.

## Installation
1. Dans Supabase SQL Editor, utilisez `TAFASS_V74_1_PLATFORM_MONETIZATION_FIX.sql` à la place de l'ancien SQL V74.
2. Exécutez le fichier complet.
3. Vérifiez ensuite que le compte administrateur possède bien `profiles.is_admin = true`.

Cette correction ne demande pas de colonne `profiles.role`.
