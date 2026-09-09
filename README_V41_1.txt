TAFAß V41.1 — OWNER_ID AMBIGUITY HOTFIX

Olana voamarina:
PostgreSQL dia nahazo "column reference \"owner_id\" is ambiguous" satria tao amin'ny V40 ny variable PL/pgSQL sy ny colonne SQL samy nantsoina hoe owner_id.

FIX:
- v_owner_id no ampiasaina amin'ny variable.
- public.pages p sy public.groups g dia vo-qualified mazava.
- page_followers sy group_members koa vo-qualified.
- Tsy mamafa na manova data efa misy.
- Azo alefa indray (safe to re-run).

ATAO AO SUPABASE:
1. Sokafy SQL Editor.
2. Alefaso manontolo ny TAFASS_V41_1_OWNER_ID_AMBIGUITY_FIX.sql.
3. Tokony hivoaka: TAFAß V41.1 — OWNER_ID AMBIGUITY FIX READY.
4. Re-load/redeploy ny frontend raha ilaina.

ZAVA-DEHIBE:
Aza averina alefa intsony ilay V40_LIMITES_PAGES_GROUPES_VERIFICATION.sql taloha raha tsy efa nosoloina ity hotfix ity, satria ao amin'ny V40 no misy ilay owner_id ambiguity.
