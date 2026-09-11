TAFAß V73 — FINAL STABLE PATCH

Base: V72 Profile Wall + Presence.

Modifications:
- PDP personal/public: strict circular clipping + corrected position.
- Profile wall composer: preserved and functional; owner target is displayed.
- Profile wall publication supports immediate publication or approval workflow from V72 SQL.
- Navigation no longer replaces the current screen with a skeleton/transition.
- Reconnect/foreground UI overlays removed; realtime recovery is silent.
- Presence updates labels without refetching/re-rendering the whole profile.
- Signup/profile hydration keeps first name, last name, email and other entered data after login.
- Search remains clean until the user explicitly submits a query.
- Runtime duplicate shell/overlay cleanup.
- No advertisement slots mounted by V73 runtime.

Install: replace only the files in this patch. Run the V72 SQL once if not already applied. No new SQL is required by V73.
