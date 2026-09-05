# Tafaß V33 — Messages & Stories UI

Modifications only:
- Messages conversation redesigned clean like the supplied Messenger reference: no shared theme/background card, compact header, clean bubbles, simple composer.
- Story composer redesigned premium with text counter, media picker, live preview and 24h publication information.
- Story publication writes an explicit 24-hour `expires_at`, uploads media to the existing posts storage bucket and refreshes Actualités so the published story is immediately displayed.
- Existing realtime conversation/story infrastructure is preserved.
