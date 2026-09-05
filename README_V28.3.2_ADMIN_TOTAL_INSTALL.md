# Tafaß V28.3.2 — Admin Total

## 1. Supabase
Dans Supabase → SQL Editor, exécuter dans cet ordre :
1. `TAFASS_ADMIN_TOTAL_HERYMAHANDRY.sql`
2. `TAFASS_ADMIN_TOTAL_V28_3_2_COMPLETE.sql`

Le premier attribue `super_admin` au compte `herymahandry04@gmail.com`.
Le second crée les RPC sécurisées du tableau de bord.

## 2. Vérification
Exécuter :
```sql
select u.email, r.role
from public.tafa_admin_roles r
join auth.users u on u.id = r.user_id
where u.email = 'herymahandry04@gmail.com';
```
Résultat attendu : `super_admin`.

## 3. App
Déployer ce ZIP, puis déconnecter/reconnecter le compte.

## 4. Correctif Menu
V28.3.2-FIX garantit que le Menu normal ne dépend plus du temps de réponse de `tafa_is_admin()`. Si Supabase est lent ou si les SQL Admin ne sont pas encore exécutés, le Menu reste accessible; la carte Admin Total apparaît seulement après une vérification serveur positive.
