# Tafaß V72 — Profile Wall + PDP + Presence + Fluid Navigation

Patch-only basé sur Tafaß V71.

## Modifications
- PDP strictement rond : l'image reste toujours dans son cadre circulaire.
- Profil ami / non-ami conservé avec actions adaptées.
- `Écrivez quelque chose…` devient un vrai composer de publication sur profil.
- Un ami peut publier sur le profil d'un autre ami.
- Le propriétaire peut choisir : autoriser les amis à publier et exiger ou non une approbation.
- Les publications en attente sont visibles au propriétaire et à leur auteur, puis peuvent être approuvées/refusées.
- Les publications de profil sont stockées dans `tafa_profile_wall_posts` et affichées avec la mention « sur le profil de … ».
- Présence globale Supabase Realtime : point jaune si le compte est en ligne.
- `last_seen_at` est mis à jour côté serveur toutes les 45 secondes ; lorsqu'un compte est hors ligne, son ancienneté apparaît automatiquement.
- Navigation : les actions ne sont plus bloquées pendant le petit loader de changement de page.
- Recherche : les résultats sont lancés après validation (bouton ou Entrée), au lieu de reconstruire la page à chaque frappe.
- Service Worker / cache passent en V72.

## SQL obligatoire
Exécuter `TAFASS_V72_PROFILE_WALL_PRESENCE.sql` dans Supabase SQL Editor.

Le SQL crée :
- `tafa_profile_wall_settings`
- `tafa_profile_wall_posts`
- `profiles.last_seen_at`
- RPC sécurisées pour publier, approuver/refuser/supprimer et mettre à jour la présence.

## Validation
`node --check app.js` doit retourner sans erreur.
