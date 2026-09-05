# Tafaß V26.3 — AI Failed to Fetch FIX

## Fanamboarana
Ny frontend dia tsy manao `fetch()` mivantana amin'ny URL `/functions/v1/tafass-ai` intsony.
Ampiasaina izao ny `supabase.functions.invoke("tafass-ai")`, ka ny Supabase JS SDK no mitantana ny project URL sy ny authentication.

## Ilaina ao Supabase
1. Deploy the Edge Function:

```bash
supabase functions deploy tafass-ai
```

2. Apetraho ny secret:

```bash
supabase secrets set OPENAI_API_KEY="VOTRE_CLE_API"
```

Optionnel:

```bash
supabase secrets set TAFASS_AI_MODEL="gpt-4.1-mini"
```

Aza apetraka ao amin'ny `app.js` na `index.html` mihitsy ny `OPENAI_API_KEY`.

## Zava-dehibe
Ny fanovana frontend dia manala ny olana ateraky ny endpoint URL voa-assemble manual. Saingy tsy afaka mandeha ny AI raha tsy efa **deployed** ao amin'ilay projet Supabase ampiasain'i Tafaß ny function `tafass-ai`.
