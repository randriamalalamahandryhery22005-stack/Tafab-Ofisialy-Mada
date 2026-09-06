TAFAß — FINAL PREMIUM / GOOGLE / ADS / MONÉTISATION

Cette version part de la V2 Monétisation précédente.

1. GOOGLE — ÉCRAN DE SÉLECTION
- Le sélecteur Google reste volontairement visible : l'utilisateur choisit son compte Google.
- Le nom qvx...supabase.co affiché dans l'écran Google est fourni par Google OAuth, pas par le HTML/CSS de Tafaß.
- Pour afficher le nom de marque Tafaß Ofisialy à la place du nom technique du projet, configurer dans Google Cloud Console :
  Branding / OAuth consent screen → App name = Tafaß Ofisialy.
- Utiliser le même projet OAuth que celui configuré dans Supabase.
- Ne pas supprimer prompt=select_account : il conserve le choix du compte Google.
- L'application ne peut pas masquer la barre d'adresse ou l'interface native de Google/Chrome.

2. PUBLICITÉS SPONSORISÉES
- Ajout d'un vrai bouton « Voir » pour chaque publicité sponsorisée.
- Une publicité photo s'ouvre dans une visionneuse premium.
- Une publicité vidéo s'ouvre avec lecteur vidéo et contrôles.
- Les événements restent enregistrés côté serveur.
- La marque « TAFAß ADS · SPONSORISÉ » est séparée du contenu normal.
- Les publicités ne sont pas marquées comme payées/actives par l'interface : leur diffusion dépend des statuts serveur et de la validation admin.

3. BONUS NOUVEAU COMPTE
- Chaque nouveau compte auth.users reçoit automatiquement 100 coins côté serveur.
- Le trigger utilise ON CONFLICT DO NOTHING pour éviter un double crédit.
- Le bonus fonctionne pour une création e-mail et pour une création OAuth.
- Les comptes existants ne reçoivent pas rétroactivement le bonus.

4. RETRAIT CRÉATEUR
- Minimum réel : 1 000 Ar.
- Barème actuel : 10 coins = 1 Ar brut.
- Donc 10 000 coins de valeur brute correspondent à 1 000 Ar brut.
- Le retrait est demandé en MGA à partir du solde de revenus créateur, puis réservé côté serveur.
- Le paiement final n'est considéré comme « payé » qu'après action réelle de l'administration.
- Aucun paiement Mobile Money n'est simulé par le frontend.

5. ADMIN / MONÉTISATION
- Les titres et leurs mentions sont séparés visuellement.
- Les sous-sections de monétisation sont séparées : activation et retraits.
- Les cartes, listes, statuts et actions restent indépendants pour faciliter la lecture.
- Les confirmations sensibles utilisent l'interface premium interne et non les boîtes natives du navigateur.

6. SQL
Exécuter TAFASS_MONETISATION_V2_REAL_COINS_WITHDRAWALS.sql dans Supabase SQL Editor.
Ce SQL conserve les tables existantes et ajoute uniquement le bonus serveur et la normalisation du seuil minimum.
