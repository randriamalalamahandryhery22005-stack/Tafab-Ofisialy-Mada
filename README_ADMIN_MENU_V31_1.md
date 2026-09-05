# Tafaß Admin Menu V31.1

- The Menu now resolves the admin role from `tafa_is_admin(auth.uid())` before rendering.
- `admin` and `super_admin` roles are accepted.
- The Administration section appears only for an authenticated admin.
- The profile flags `is_admin` and `admin_badge` are synchronized for the red admin verified badge.
- The supplied admin UUID is `edcfd4fe-e75e-4c66-a816-c4671021aef2`.

Run `TAFASS_ADMIN_MENU_ROLE_SYNC_V31_1.sql` once in Supabase SQL Editor.
Then logout/login again and open Menu.
