# Tafaß V69 — Badge bleu + paiement Papi réel

## Ce que cette version ajoute
- Demande de badge bleu avec paiement Papi intégré.
- Frais configurés à 25 000 Ar / mois.
- Méthodes proposées : MVola, Orange Money, Airtel Money.
- Aucun API key dans `app.js` : le secret reste `PAPI_API_KEY` côté Supabase.
- Création du lien Papi via l'Edge Function `tafa-papi-badge-payment`.
- Notification Papi reçue par `tafa-papi-notify`.
- Une notification SUCCESS marque le paiement comme confirmé et informe l'utilisateur + les administrateurs.
- L'administration ne peut plus approuver un badge si le paiement Papi n'est pas confirmé.
- Paiement et dossier restent séparés : paiement confirmé = argent reçu côté compte/règlement Papi ; validation du badge = décision de l'Admin.
- Realtime sur les paiements badge et les demandes de vérification.

## À faire dans Supabase
1. Exécuter `TAFASS_V68_PAPI_PAYMENTS.sql` dans SQL Editor. Le fichier contient maintenant le bloc V69 à la fin.
2. Garder le secret Edge Function `PAPI_API_KEY` déjà créé.
3. Déployer :
   - `supabase/functions/tafa-papi-badge-payment/index.ts`
   - `supabase/functions/tafa-papi-notify/index.ts`
4. Pour `tafa-papi-notify`, désactiver la vérification JWT de l'Edge Function dans Supabase, car l'appel de notification vient de Papi. La fonction vérifie elle-même la référence + notificationToken.
5. Vérifier dans Papi que l'application/boutique est en mode Production et que MVola, Orange Money et Airtel Money sont activés.
6. Configurer dans Papi le compte de règlement souhaité. Tafaß ne peut pas forcer depuis le frontend un numéro Mobile Money arbitraire.

## Test recommandé
1. Utiliser un compte utilisateur Tafaß de test.
2. Menu → Vérification → Demander la vérification.
3. Compléter identité, catégorie et justificatif.
4. Choisir MVola, Orange Money ou Airtel Money.
5. Cliquer « Payer avec Papi ».
6. Terminer le paiement sur Papi.
7. Vérifier que la notification Papi arrive et que le paiement passe à `SUCCESS`.
8. Dans Admin → Vérifications, le bouton « Approuver » devient disponible seulement après `SUCCESS`.

## Important
Cette version ne prétend pas transformer Papi en API de payout vers les numéros personnels des créateurs. Le retrait créateur réel nécessite une API payout/disbursement Papi (ou un prestataire de payout) distincte si elle est disponible.
