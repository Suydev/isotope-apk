-- Captured from prod 2026-08-29T05:07:48.355Z before repairing search_path.
-- Restores the previous six-quote value on all 23 functions.

ALTER FUNCTION _auto_add_group_owner() SET search_path TO '""""""';
ALTER FUNCTION _auto_add_super_admin() SET search_path TO '""""""';
ALTER FUNCTION check_user_role(uuid,text) SET search_path TO '""""""';
ALTER FUNCTION cleanup_old_notifications() SET search_path TO '""""""';
ALTER FUNCTION expire_stale_presence() SET search_path TO '""""""';
ALTER FUNCTION get_my_group_ids() SET search_path TO '""""""';
ALTER FUNCTION get_my_role() SET search_path TO '""""""';
ALTER FUNCTION is_premium_user() SET search_path TO '""""""';
ALTER FUNCTION private.can_manage_group(uuid,uuid) SET search_path TO '""""""';
ALTER FUNCTION private.is_group_member(uuid,uuid) SET search_path TO '""""""';
ALTER FUNCTION purchase_store_item(uuid,uuid) SET search_path TO '""""""';
ALTER FUNCTION rls_auto_enable() SET search_path TO '""""""';
ALTER FUNCTION rpc_private.accept_invite(text) SET search_path TO '""""""';
ALTER FUNCTION rpc_private.get_invite_details(text) SET search_path TO '""""""';
ALTER FUNCTION rpc_private.join_community_event(uuid) SET search_path TO '""""""';
ALTER FUNCTION rpc_private.leave_community_event(uuid) SET search_path TO '""""""';
ALTER FUNCTION rpc_private.purchase_store_item(uuid,uuid) SET search_path TO '""""""';
ALTER FUNCTION set_group_slug_from_name() SET search_path TO '""""""';
ALTER FUNCTION set_user_tours_updated_at() SET search_path TO '""""""';
ALTER FUNCTION sync_group_member_count() SET search_path TO '""""""';
ALTER FUNCTION sync_group_visibility() SET search_path TO '""""""';
ALTER FUNCTION sync_user_display_profile() SET search_path TO '""""""';
ALTER FUNCTION sync_user_onboarding_from_profile() SET search_path TO '""""""';
