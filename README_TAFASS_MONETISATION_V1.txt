TAFAß MONÉTISATION V1

Fichiers : app.js, style.css, TAFASS_MONETISATION_V1_REAL_EARNINGS_WITHDRAWALS.sql

1. Importez/exécutez le SQL dans Supabase.
2. Rechargez l’application.
3. Menu > Monétisation : demande d’activation, moyens MVola/Orange Money/Airtel Money, portefeuille et retrait.
4. Administration > Monétisation : validation des créateurs et traitement des retraits.

Important : cette V1 sécurise le registre de revenus et le workflow de retrait. Le paiement final Mobile Money reste effectué par l’administration tant que les identifiants/API marchands des opérateurs ne sont pas configurés côté serveur. Ne placez jamais de clé API opérateur dans app.js.

Les cadeaux Live deviennent des revenus uniquement pour un créateur dont la monétisation est approuvée. La valeur 1 coin = 1 Ar et la part créateur 70 % sont des paramètres initiaux côté SQL et doivent être adaptés à l’économie réelle de Tafaß avant lancement commercial.
