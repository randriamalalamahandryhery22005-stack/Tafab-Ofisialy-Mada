# Tafaß V76 — Admin / Parrainage / Coins / Profil

Base : Tafaß V74/V74.1 + correctifs V75.

## Corrections

- **Admin → Comptes d'utilisateurs** : vrai tableau stable, 8 comptes seulement dans la vue principale (4 + 4) et `Voir plus` pour la liste complète.
- **Admin → Tableau de bord** : les 4 onglets sont de vrais panneaux exclusifs : Évolutions, Comptes utilisateurs, Monétisations, Signalements & Réactivations.
- **Admin** : monétisation automatiquement active côté SQL avec `profiles.is_admin=true` ; aucune demande d'activation.
- **Admin** : achat de coins masqué ; l'Admin utilise le portefeuille plateforme et le retrait Admin uniquement.
- **Parrainage** : chaque compte possède un code copiable. Le code peut être affiché/copié avant activation, mais il ne génère de récompense que lorsque la monétisation du propriétaire est active. L'Admin est automatiquement actif.
- **Coins** : mêmes quantités de coins, mais prix d'achat multipliés par 2 : 2 000 / 10 000 / 20 000 / 50 000 Ar.
- **PDP** : clipping circulaire renforcé avec `box-sizing:border-box`, `overflow:hidden` et `object-fit:cover` pour les profils d'autres comptes également.
- **Identité du profil** : récupération depuis `auth.users.raw_user_meta_data` + réparation des profils affichant `Membre Tafaß` alors qu'un prénom/nom avait été fourni à l'inscription.

## Fichiers à remplacer / ajouter

- `app.js`
- `style.css`
- `sw.js`
- `TAFASS_V76_MONETIZATION_REFERRAL_PROFILE.sql`
- `supabase/functions/tafa-papi-payment/index.ts`

## SQL

1. Exécuter `TAFASS_V76_MONETIZATION_REFERRAL_PROFILE.sql` après V74/V74.1.
2. Le SQL n'utilise **pas** `profiles.role` et n'utilise **pas** `profiles.admin_badge`.
3. L'Admin est détecté uniquement avec `profiles.is_admin=true`.
4. Le code de parrainage reste facultatif et ne peut jamais bloquer une inscription.

## Papi / coins

Redéployer `tafa-papi-payment` avec le fichier V76. Les nouveaux montants acceptés côté serveur sont :

- 2 000 Ar → 10 000 coins
- 10 000 Ar → 50 000 coins
- 20 000 Ar → 100 000 coins
- 50 000 Ar → 250 000 coins

Conserver `PAPI_API_KEY` uniquement dans les secrets Supabase Edge Function.

## Vérification

`node --check app.js` : PASS.
