# Tafaß V74 — Platform Monetisation / Admin / Parrainage

Base: Tafaß V73.

## Fichiers
- `app.js`
- `style.css`
- `index.html`
- `sw.js`
- `TAFASS_V74_PLATFORM_MONETIZATION.sql`
- ce README

## SQL
Exécuter `TAFASS_V74_PLATFORM_MONETIZATION.sql` dans Supabase.

Le système est serveur-side et idempotent :
- bonus de bienvenue coins pour chaque nouveau compte ;
- part plateforme Admin sur créations, publications et engagements ;
- revenus utilisateurs sur activités éligibles ;
- code de parrainage facultatif ; un code valide donne un bonus supplémentaire au parrain et au nouveau compte ;
- un code invalide ou absent ne bloque jamais l'inscription ;
- portefeuille plateforme Admin et demande de retrait prioritaire à partir de 1 000 Ar ;
- ledger unique anti-duplication ;
- realtime sur les nouveaux portefeuilles/ledger/retraits.

Le retrait réel reste soumis au moyen de paiement actif et au processus de paiement configuré côté serveur. Aucun numéro Mobile Money n'est codé dans le frontend.

## Vérification
`node --check app.js`
