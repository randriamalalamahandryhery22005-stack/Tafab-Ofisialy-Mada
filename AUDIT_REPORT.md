# Tafaß CLEAN CORE V1 — Static audit

- app.js: 5377 lines
- style.css: 4431 lines
- index.html: 179 lines
- SQL files in original ZIP: 42
- `.bak` files excluded from deploy: yes

## Confirmed
- JavaScript syntax was verified as valid in the previous audit.
- No duplicate top-level function declarations were detected by the simple declaration scan.
- `TAFASS_COMPLETE_SCHEMA.sql` and `TAFASS_FINAL_COMPLETE_REALTIME.sql` are byte-identical; only the former is active in this clean package.

## Frontend database surface
- Unique tables referenced by app.js: 76
- Unique RPCs referenced by app.js: 35
- Tables not declared by canonical schema: 48
- RPCs not declared by canonical schema: 33

Missing tables:
audience_settings, connected_apps, game_scores, group_messages, group_post_comments, group_post_reactions, group_post_shares, group_posts, group_role_requests, live_comments, live_sessions, page_members, page_messages, page_post_comments, page_post_reactions, page_post_shares, page_posts, page_reports, page_role_requests, privacy_protection_settings, professional_integrations, profile_identification_settings, profile_locations, reaction_settings, tafa_account_appeals, tafa_verification_requests, tafab_ad_campaigns, tafab_ai_history, tafab_business_profiles, tafab_conversation_aliases, tafab_creator_drafts, tafab_creator_subscriptions, tafab_deleted_conversations, tafab_event_attendees, tafab_events, tafab_favorites, tafab_live_gifts, tafab_message_blocks, tafab_message_edits, tafab_message_hidden, tafab_message_reactions, tafab_music_likes, tafab_music_playlists, tafab_music_tracks, tafab_order_items, tafab_orders, tafab_wallets, tafab_withdrawal_requests

Missing RPCs:
tafa_account_guard, tafa_admin_badge_count, tafa_admin_list_account_appeals, tafa_admin_list_payments, tafa_admin_list_reports, tafa_admin_list_users, tafa_admin_list_verification_requests, tafa_admin_list_withdrawals, tafa_admin_register_media_hash, tafa_admin_set_account_status, tafa_admin_set_appeal_status, tafa_admin_set_payment_status, tafa_admin_set_report_status, tafa_admin_set_verification_status, tafa_admin_set_withdrawal_status, tafa_admin_total_stats, tafa_can_create_group, tafa_can_create_page, tafa_delete_comment, tafa_delete_post, tafa_is_admin, tafa_moderation_check_media, tafa_report_post, tafa_set_post_reaction, tafa_share_post, tafa_submit_account_appeal, tafa_submit_verification_request, tafa_update_post, tafab_ad_campaign_stats, tafab_delete_message_for_everyone, tafab_edit_message, tafab_music_register_play, tafab_send_live_gift

## Critical conclusion
The main remaining risk is schema drift: app.js references a much larger database surface than the canonical schema alone declares. The archived SQL contains later objects, but those patches must be reconciled into one ordered migration rather than executed indiscriminately.

## Product completion order
1. Core navigation and shell
2. Actualités
3. Amis
4. Alertes
5. Messages
6. Pages
7. Groupes
8. Profil
9. Tafaß hub
10. Menu/admin/security
