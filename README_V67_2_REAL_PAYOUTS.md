# Tafaß V67.2 — Retraits réels

Moyens de retrait créateur : **MVola, Orange Money, Airtel Money et Banque**. Yas Money est retiré de cette partie.

## Important pour le paiement automatique
Le code et la base sont préparés pour un paiement réel côté serveur. Pour qu'un retrait arrive effectivement sur le compte du bénéficiaire, il faut activer les contrats/API de paiement du compte professionnel Tafaß auprès des opérateurs concernés (et la banque). Les secrets ne doivent jamais être placés dans `app.js`.

Le statut `Payé` ne doit être écrit qu'après confirmation d'une transaction externe réussie avec une référence de transaction. Tant que les identifiants/API de production ne sont pas configurés, le retrait reste `pending`.

MVola documente un environnement Developer/Sandbox et un passage `GO LIVE`; les transferts réels nécessitent l'autorisation du fournisseur.
