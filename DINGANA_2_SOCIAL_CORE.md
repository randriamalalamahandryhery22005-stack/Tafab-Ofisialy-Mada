# Tafaß — DINGANA 2 : SOCIAL CORE

## Scope
Fanamafisana ny Social Core amin'ny base efa misy, tsy fanoloana backend.

### Modules voakasika
- Publications: reactions, commentaires, partage/repost, lien, vues.
- Amis: demandes, accept/refuse, suggestions, friendships.
- Messages: conversations, Realtime, typing/presence, fichiers, vocaux, réactions.
- Notifications: badges, marquage lu, Realtime.
- Recherche: comptes, publications, pages, groupes, recherche déclenchée explicitement.

## Fanovana amin'ity version ity
1. Nampiana son notification locale rehefa misy notification Realtime vaovao ho an'ilay utilisateur.
2. Tsy ovaina ny tables/schema Supabase.
3. Tsy ovaina ny authentication, Realtime architecture, RPCs na données existantes.
4. Fichier applicatif nokitihina: `app.js` ihany.
5. Tsy nampandehanana ny SQL historique rehetra.

## Test
`node --check app.js` : PASS

## Important
Ny son dia miasa rehefa efa nahazo permission/interactivité audio ny navigateur. Tsy manery autoplay notification navigateur.
