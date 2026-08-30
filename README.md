# Tafaß — V28 STABLE CLEAN

## Fanamboarana lehibe
- Profile editor responsive: Bio / Lieu / Pdp / Pdc, misy scroll anatiny ary bouton Enregistrer tsy voasarona.
- PDP feno tsara ao anaty rond (`object-fit: cover`).
- Pays sy code téléphone automatique; ny numéro soratana dia national ihany (oh: Madagascar: `330000000`, tsy misy `+261`).
- Ville actuelle: recherche amin'ny lisitra voafetra amin'ireo villes/communes fantatra ao amin'ny app, anisan'izany Ambohimanambola.
- Ville d'origine: recherche amin'ny 6 provinces de Madagascar.
- Nom/prénom, date de naissance, genre, e-mail ary numéro ao Paramètres; Bio/Lieu/PDP/PDC ao Profil.
- Navigation mobile 6 onglets: Actualités, Amis, Messages, Pages, Groupes, Tafaß. Tsy misy Videos standalone.
- Responsive amin'ny écran kely sy lehibe; ny contenu farany sy boutons dia manana toerana ampy ambonin'ny bottom navigation.
- Supabase auth callback tsy manao opérations async mivantana ao amin'ny `onAuthStateChange`, hisorohana auth-lock/deadlock.

## Google / Apple
Raha efa misy compte e-mail voamarina ary mitovy amin'ny e-mail Google/Apple, ny Supabase dia mila **Automatic Identity Linking** alefa ao amin'ny Authentication settings. Rehefa mandeha io, ny OAuth dia mampifandray amin'ilay compte efa misy fa tsy mamorona doublon. Tsy azo atao amin'ny frontend irery ny mampifandray identity tsy misy an'io sécurité Supabase io.

## Database
Aza alefa intsony ireo SQL version taloha. Ampiasao ny `TAFASS_NEW_PROJECT.sql` raha installation vaovao. Raha database efa mandeha no ampiasaina, jereo aloha fa misy ireo colonnes ampiasain'ny app: `first_name,last_name,email,phone,phone_code,birth,gender,country,city_current,city_origin,location,avatar_url,cover_url,name_changed_at`.
