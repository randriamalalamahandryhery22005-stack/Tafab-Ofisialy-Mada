# Tafaß V77 — Coins pricing + personnalisation

Patch based on V76.

## Nouveau barème d'achat
- 10 000 coins = 500 Ar
- 50 000 coins = 2 500 Ar
- 100 000 coins = 5 000 Ar
- 250 000 coins = 12 500 Ar
- Tarif de référence : 20 coins = 1 Ar.

## Achat personnalisé
L'utilisateur peut saisir un nombre de coins, par multiples de 1 000. Le prix est calculé automatiquement côté interface et surtout recalculé côté Edge Function avant l'appel Papi.

Limites V77 : 1 000 à 10 000 000 coins par achat.

## Fichiers
- app.js
- style.css
- sw.js
- supabase/functions/tafa-papi-payment/index.ts
- README_V77_COINS_PRICING.md

## Déploiement
1. Remplacer les fichiers du patch dans le projet.
2. Redéployer l'Edge Function `tafa-papi-payment`.
3. Tester un pack standard puis un montant personnalisé (ex. 30 000 coins = 1 500 Ar).
4. Vérifier que le crédit des coins intervient uniquement après la notification serveur Papi.
