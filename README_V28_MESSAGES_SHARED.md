# Tafaß V28 — Messages Shared UX

- Deleting a conversation is scoped to the current account. If that account starts a new chat with the same person later, the deleted conversation is ignored and a fresh conversation is created.
- Conversation themes are now shared by both participants. Changing the theme on one account updates the other account through Supabase Realtime.
- Added shared conversation aliases for both participants. Either account can change the displayed pseudo of either participant; the target account receives a notification indicating who changed it and the new pseudo.
- First contact: when a private conversation has no messages yet, three personalized greeting suggestions are displayed with the other account's name. Choosing one sends it immediately; the normal composer remains available for a custom message.
- Existing message features and data are preserved.

## Supabase
Run `TAFASS_MESSAGES_V28.sql` in the Supabase SQL editor before using shared themes/aliases.
