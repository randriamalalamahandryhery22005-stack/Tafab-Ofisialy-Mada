Tafaß V48 — SECURITY CENTER

Patch-only: app.js, style.css, index.html.

Ajouts:
- Centre de sécurité premium.
- Activation 2FA TOTP avec QR code + clé secrète + vérification à 6 chiffres.
- Désactivation propre du facteur 2FA.
- Vue de la session actuelle et expiration.
- Déconnexion de toutes les sessions via Supabase.
- Historique récent des activités de sécurité.
- Mot de passe renforcé (minimum 8 caractères).
- Cache frontend V148.

Aucun SQL supplémentaire requis : V48 utilise les APIs Auth/MFA Supabase existantes et la table activity_history déjà utilisée par Tafaß.
