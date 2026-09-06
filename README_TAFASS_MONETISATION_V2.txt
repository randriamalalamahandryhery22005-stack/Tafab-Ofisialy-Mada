TAFAß — MONÉTISATION V2
========================

Cette version corrige et complète le flux :

1. COINS → REVENUS
- 10 coins de valeur brute = 1 Ar brut.
- La part créateur configurée (70 % par défaut) est appliquée côté serveur.
- Un cadeau Live éligible crée une ligne de revenus unique dans le ledger.
- L'ancien double crédit du cadeau Live est supprimé.
- Les coins du créateur ne sont plus gonflés artificiellement lors de la réception.

2. DEMANDE DE RETRAIT
- Le créateur doit être approuvé dans le programme de monétisation.
- Il enregistre MVola, Orange Money ou Airtel Money.
- Le montant demandé est retiré du solde disponible et réservé dans le solde en attente.
- L'administration paie réellement le Mobile Money puis choisit « Marquer comme payé ».
- Le statut final devient « paid ».
- En cas de refus, le montant réservé revient automatiquement au solde disponible.
- Une notification est envoyée au créateur.

3. ADMINISTRATION PREMIUM
- Acceptation/refus de la monétisation sans confirm() natif.
- Paiement/refus d'un retrait sans confirm() natif.
- Les autres confirmations natives de l'application ont aussi été remplacées par une interface interne premium.

4. URL / LIENS VISIBLES
- Le callback OAuth Google nettoie automatiquement les paramètres temporaires de l'URL après connexion.
- Les prompts/confirmations natives ne sont plus utilisés dans app.js.
- Les liens copiés ne sont plus affichés en clair dans les toasts.
- La barre d'adresse du navigateur/PWA reste sous le contrôle du navigateur : une application web ne peut pas la masquer elle-même.

INSTALLATION
------------
1. Déployer app.js et style.css de ce ZIP à la place des fichiers actuels.
2. Exécuter TAFASS_MONETISATION_V2_REAL_COINS_WITHDRAWALS.sql dans Supabase SQL Editor.
3. Tester avec un créateur approuvé : Live → cadeau → revenus → moyen de retrait → demande → Admin → payer/refuser.

IMPORTANT
---------
Le statut « payé » ne doit être choisi qu'après un paiement réel effectué par l'administration. Aucun argent réel n'est fabriqué par le navigateur.
