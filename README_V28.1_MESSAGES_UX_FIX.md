# Tafaß V28.1 — Messages UX Fix FINAL

- Shared conversation theme is now visibly shown in the Messages conversation list and inside the open conversation header.
- Theme changes refresh immediately after save and remain shared through Supabase Realtime.
- Pseudo changes close the edit modal after successful save and immediately refresh the conversation/list; Cancel also exits the editor.
- Message send/receive continues to refresh the active conversation immediately through Realtime.
- Emoji in aliases/pseudos use emoji-capable system fonts and plaintext direction so emoji remain visible and are not altered.
- Existing V28 data and functionality are preserved.

SQL: run the existing `TAFASS_MESSAGES_V28.sql` from this ZIP if it has not already been applied.
