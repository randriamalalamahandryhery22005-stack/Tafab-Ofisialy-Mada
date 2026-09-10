# Tafaß V67.3 — Paiements réels

Moyens disponibles: **MVola, Orange Money, Airtel Money, Banque**. Yas est exclu du retrait créateur.

## 1. SQL
Exécuter `TAFASS_V67_3_REAL_PAYOUTS.sql` dans Supabase SQL Editor.

## 2. Edge Function
Déployer `supabase/functions/tafa-payout` comme fonction Supabase.

## 3. Secrets obligatoires
Configurer dans Supabase Edge Functions:

- `PAYOUT_MVOLA_URL` + `PAYOUT_MVOLA_TOKEN`
- `PAYOUT_ORANGE_URL` + `PAYOUT_ORANGE_TOKEN`
- `PAYOUT_AIRTEL_URL` + `PAYOUT_AIRTEL_TOKEN`
- `PAYOUT_BANK_URL` + `PAYOUT_BANK_TOKEN`

Les URLs et tokens doivent venir des contrats/API officiels des prestataires. Ne jamais mettre ces secrets dans `app.js`.

La fonction utilise une clé d'idempotence par retrait, refuse de marquer `Payé` sans réponse de succès et conserve la référence externe.

## 4. Contrat attendu du connecteur
POST JSON:
```json
{
  "reference":"UUID_TAFASS",
  "amount":10000,
  "currency":"MGA",
  "provider":"mvola",
  "beneficiary":{"name":"Nom","phone":"0340000000"}
}
```

Réponse de succès attendue:
```json
{"status":"success","transactionId":"PROVIDER-REFERENCE"}
```

Pour Banque, `beneficiary` contient `name`, `bank`, `account`.

> Une vraie transaction nécessite un compte marchand/partenaire et une autorisation production du prestataire. MVola indique notamment que l'environnement réel nécessite une procédure « GO LIVE ». Les clés/API restent des secrets serveur.
