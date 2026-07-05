---
name: Community SQL hardening
description: What was wrong with community RLS/RPCs and how 009_community_hardening.sql fixed it
---

## Problem
- `ginv_create` policy allowed only 'admin','moderator' to create invites — excluded 'owner'
- `gm_insert` (FOR INSERT WITH CHECK auth.role()='authenticated') let any user directly INSERT to group_members
- `gm_own_write` (FOR ALL using user_id=uid) allowed self-role escalation via direct UPDATE
- No `create_community_group`, `join_community_group`, `leave_community_group`, `delete_community_group`, `update_group_member_role` RPCs existed
- `accept_invite` did not enforce max_members, did not bump member_count
- No unique slug constraint on groups table
- No member_count sync trigger — count drifted from reality
- group announcements/challenges had no role restriction on writes

## Fix (sql/009_community_hardening.sql in isotope-code)
All write operations routed through SECURITY DEFINER RPCs:
- `create_community_group(name,desc,category,cover_url,is_public,max_members,visibility)` — atomic group+member, unique slug loop
- `join_community_group(group_id)` — checks is_public, max_members, existing membership
- `leave_community_group(group_id)` — blocks owner self-removal
- `delete_community_group(group_id)` — owner-only; cascades challenges, announcements, milestones, chat, invites, members, group row
- `update_group_member_role(group_id,target_uid,role)` — prevents self-change, blocks promotion to owner, enforces caller rank
- `accept_invite(code)` — max_members check + member_count bump
- `get_invite_details(code)` — returns slug fallback, valid flag
- `_sync_group_member_count()` trigger — AFTER INSERT/DELETE on group_members

**Why:** Frontend compiled JS uses direct table inserts (no RPCs for create/join). Without the policy change, any authenticated user could insert arbitrary group_members rows or self-promote.

**How to apply:** Run file in Supabase SQL Editor for project vteqquoqvksshmfhuepu. Then backfill: `UPDATE public.groups g SET member_count=(SELECT COUNT(*) FROM public.group_members WHERE group_id=g.id);`
