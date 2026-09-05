# Tafaß V36 — Messages final geometry fix

Base: Tafaß V35 Messages Clean.

Changes:
- Removed all outer/giant message card backgrounds; only blue sent bubbles and grey/dark received bubbles remain.
- Conversation themes now decorate only the conversation background, never the message bubbles/cards.
- Fixed short-message sizing so a short word such as “Oui” does not wrap into narrow columns.
- Fixed long-message wrapping: text stays horizontal, uses the available bubble width, wraps cleanly at the edge, and never visually drops one character per line because of a narrow parent.
- Reactions remain underneath the bubble, separated from the message text.
- Added long-press on both sent and received messages (about 620 ms) to open the existing message options menu.
- Added pointer-movement cancellation so scrolling does not accidentally open the menu.
- Added right-click/context-menu support on desktop for message options.
- Kept the existing premium icon-only action buttons and theme settings.

Files modified:
- app.js
- style.css
