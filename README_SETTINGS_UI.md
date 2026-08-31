# Tafaß — Paramètres & confidentialité (UI réelle)

Cette version reprend l’organisation sombre de l’interface de référence :
**Para & Conf → catégories → sous-pages → contrôles → Enregistrer → retour**.

## Installation Supabase

1. Exécuter `TAFASS_COMPLETE_SCHEMA.sql` si le schéma principal n’est pas encore installé.
2. Exécuter `TAFASS_SETTINGS_COMPLETE_REALTIME.sql`.
3. Exécuter `TAFASS_SETTINGS_UI_REALTIME.sql`.

Le troisième fichier ajoute les réglages détaillés réellement persistés pour :
- Stories
- Publications
- Followers et contenu public

Les autres sous-pages utilisent les tables de `TAFASS_SETTINGS_COMPLETE_REALTIME.sql` et `user_settings`.

## Realtime

Les tables de paramètres sont ajoutées au canal Realtime de l’application. Une modification effectuée depuis un autre client actualise automatiquement la sous-page ouverte.

## Interface

- Mode sombre uniquement dans ce build.
- Les options ne sont plus de simples écrans décoratifs : les interrupteurs et sélecteurs sont enregistrés dans Supabase.
- Le bouton Retour revient au niveau précédent de `Para & Conf`.
- Blocage, applications connectées et intégrations professionnelles utilisent leurs données Supabase existantes.
