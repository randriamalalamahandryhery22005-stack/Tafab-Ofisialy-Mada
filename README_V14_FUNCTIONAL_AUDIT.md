# Tafaß V14 — Functional Audit

Date: 2026-09-05

## Scope

V14 performs a focused frontend functional audit on the V13 build. The goal is to remove dead delegated actions and make the main Page/Group/Publisher/Tafaß interactions actually respond when tapped.

## Fixed

- Modal close actions now have a direct delegated handler.
- Security: **Modifier le mot de passe** now calls the existing Supabase password update flow.
- Publication audience button opens the audience selector and saves Public / Amis / Moi uniquement.
- Page mode: **Créer la première publication** focuses the Page composer.
- Page mode publication now inserts a `page_posts` record after owner verification.
- Group post deletion now verifies owner/admin rights before deleting.
- Group discussion **Envoyer** now inserts into `group_messages` after membership verification.
- Tafaß advertisements now open a real detail modal and expose the configured target link.
- Browser cache-busting was bumped from `?v=50` to `?v=60` for `style.css` and `app.js`.

## Static validation

- `node --check app.js` — PASS
- ZIP integrity — PASS
- Literal `data-action` audit — PASS for concrete actions; remaining template expressions are dynamic by design.
- Canonical routes checked: `home`, `friends`, `search`, `messages`, `notifications`, `profile`, `reels`, `pages`, `groups`, `saved`, `menu`, `tafab`, `settings`.

## Important external configuration still required

- Supabase RLS/storage policies must be correctly deployed in the production project.
- Google/Apple OAuth requires valid provider configuration.
- Firebase FCM requires a valid Firebase Web API key/configuration.
- Production Live may require a real TURN service for difficult NAT/firewall networks.
- Real licensed music remains a product/licensing task; the current 120-track catalog is generated demo audio.
