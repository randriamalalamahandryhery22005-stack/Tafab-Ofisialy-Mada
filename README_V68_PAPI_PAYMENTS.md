# Tafaß V68 — Papi Payments / Coins

Patch-only basé sur **V67.3**. Aucun fichier du projet complet n'est inclus.

## Ce que V68 ajoute

- Connexion serveur Tafaß → Papi pour les paiements entrants.
- Achat de coins depuis **Monétisation → Acheter des coins**.
- Packs :
  - 1 000 Ar → 10 000 coins
  - 5 000 Ar → 50 000 coins
  - 10 000 Ar → 100 000 coins
  - 25 000 Ar → 250 000 coins
- Providers Papi proposés : MVola, Orange Money, Airtel Money. L'utilisateur peut aussi laisser Papi choisir le moyen.
- L'API key Papi reste uniquement dans Supabase Edge Functions.
- Papi `notificationToken` + `paymentReference` vérifiés côté serveur.
- Les coins ne sont crédités qu'après notification `SUCCESS` authentifiée.
- Idempotence : une notification `SUCCESS` répétée ne crédite pas deux fois.
- Historique des paiements Papi dans la page Monétisation.
- Realtime sur les paiements Papi.

## 1. SQL Supabase

Exécuter :

`TAFASS_V68_PAPI_PAYMENTS.sql`

## 2. Secret Supabase

Le secret doit avoir exactement ce nom :

`PAPI_API_KEY`

Ne mettez jamais cette clé dans `app.js`, `index.html` ou le navigateur.

## 3. Edge Functions

Déployer les deux fonctions :

- `supabase/functions/tafa-papi-payment/index.ts`
- `supabase/functions/tafa-papi-notify/index.ts`

La fonction **tafa-papi-payment** doit garder l'authentification JWT activée.

La fonction **tafa-papi-notify** doit être publique côté HTTP, car Papi appelle cette URL sans session Tafaß. Dans Supabase, désactiver **Verify JWT** uniquement pour `tafa-papi-notify`.

URL de notification utilisée automatiquement :

`https://<PROJECT-REF>.supabase.co/functions/v1/tafa-papi-notify`

Aucune clé n'est ajoutée à cette URL.

## 4. Papi

L'intégration utilise l'endpoint officiel de création de payment link :

`POST https://app.papi.mg/dashboard/api/payment-links`

Header serveur :

`Token: <PAPI_API_KEY>`

Le paiement est créé avec `isTestMode: false` pour le mode réel. Pour les tests Mobile Money, attention : la documentation Papi précise que le test mobile money peut déplacer de l'argent réel.

## 5. Flux réel

`Tafaß → Supabase Edge Function → Papi → MVola/Orange/Airtel → notification Papi → Supabase → +coins`

Le frontend ne peut jamais créditer lui-même les coins.

## 6. Retraits créateurs

V68 ne prétend pas transformer automatiquement les retraits créateurs en payout Papi. La documentation publique Papi utilisée pour cette version couvre le paiement entrant et les notifications de paiement. Le système de retrait V67.3 reste séparé jusqu'à ce que Papi fournisse un endpoint payout/disbursement adapté.

## Vérification technique

- `node --check app.js` : OK
- Cache frontend : V168
