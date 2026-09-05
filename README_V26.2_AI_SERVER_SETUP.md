# Tafaß V26.2 — AI serveur activée par défaut

Le frontend n'affiche plus « Tafaß AI n'est pas encore configurée côté serveur » simplement parce que `TAFASS_AI_ENDPOINT` n'existe pas.

Par défaut, Tafaß appelle :
`https://qvxmaeepwrprtoaipoir.supabase.co/functions/v1/tafass-ai`

## 1. Déployer l'Edge Function

Depuis le projet Supabase CLI :

```bash
supabase functions deploy tafass-ai
```

## 2. Ajouter la clé AI comme secret serveur

Ne mettez JAMAIS cette clé dans `app.js` ou `index.html`.

```bash
supabase secrets set OPENAI_API_KEY="VOTRE_CLE_API"
```

Optionnel : choisir le modèle :

```bash
supabase secrets set TAFASS_AI_MODEL="gpt-4.1-mini"
```

## 3. Fonctionnement

- L'utilisateur doit être connecté.
- L'Edge Function vérifie le JWT Supabase.
- La clé OpenAI reste exclusivement côté serveur.
- Le frontend envoie uniquement `mode`, `prompt` et `language`.
- Les réponses sont ensuite enregistrées dans `tafab_ai_history` par l'application selon les RLS existantes.
- Une erreur fournisseur n'expose pas les détails sensibles au client.

## 4. Endpoint personnalisé

Si vous utilisez un autre fournisseur ou une autre Edge Function, vous pouvez toujours définir avant `app.js` :

```html
<script>
  window.TAFASS_AI_ENDPOINT = "https://votre-projet.supabase.co/functions/v1/tafass-ai";
</script>
```

Le ZIP ne contient aucune clé AI secrète.
