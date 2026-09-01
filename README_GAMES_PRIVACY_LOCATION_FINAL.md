# Tafaß — Para & Conf / Games / Privacy / Location FINAL

## Jeux intégrés
18 jeux intégrés, jouables dans l'application :
- Ludo Royale
- Piano Studio (WebAudio)
- Tetris Ultra
- Mahjong Elite
- Checkers Pro
- Memory Pro
- Battle Arena
- Racing Turbo
- Football Arena
- Chess Master
- 8 Ball Pool
- Cyber Strike
- Puzzle Legend
- Air Combat
- Ninja Shadow
- Reversi Pro
- Mines Pro
- Sudoku Master

Chaque jeu possède une identité visuelle Tafaß, un bouton Jouer, une nouvelle partie et un record.
Les scores sont conservés localement et synchronisés vers `game_scores` lorsqu'un compte Supabase est connecté.

## Applications et sites Web
La connexion `Tafaß Web` représente la session/appareil actuel et est enregistrée dans `connected_apps`. Les autres connexions actives peuvent être révoquées.

## Localisation exacte
`profile_locations` conserve la position GPS fournie explicitement par l'appareil avec latitude, longitude, précision et lieu estimé. La précision réelle dépend du GPS et des autorisations de l'appareil.

## Profil verrouillé / protection
`privacy_protection_settings` permet d'activer la protection de contenu. Le profil privé est signalé par un badge « Profil verrouillé » et son accès est limité par les règles de visibilité existantes.

Sur Android, si le conteneur expose `window.TafassAndroid.setSecureFlag(true)` ou `window.AndroidTafass.setSecureFlag(true)`, Tafaß demande l'activation de la protection native de capture d'écran. Un site Web dans Chrome ne peut pas garantir à lui seul l'impossibilité d'une capture d'écran ; le bridge natif est donc nécessaire pour une vraie protection système.

## SQL
Exécuter `TAFASS_PRIVACY_LOCATION_GAMES_COMPLETE.sql` dans Supabase.
