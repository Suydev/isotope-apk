-- 019_fix_community_discover_groups.sql
--
-- Supersedes 016. Discover has been returning HTTP 400 on every call.
--
-- WHAT WAS BROKEN ON PROD (verified live before writing this):
--
--   1. The function built its query into v_sql and then CAST THE STRING to
--      jsonb instead of executing it:
--          'data', COALESCE((SELECT v_sql::jsonb), '[]'::jsonb)
--      Postgres: 22P02 invalid input syntax for type json,
--                Token "SELECT" is invalid.
--
--   2. The built query ordered by g.created_at inside an aggregate with no
--      GROUP BY:  42803 column "g.created_at" must appear in the GROUP BY
--      clause or be used in an aggregate function.
--
-- WHY NOT JUST APPLY 016: it fixes both of the above (EXECUTE + max(created_at))
-- but leaves LIMIT/OFFSET on the AGGREGATE query. An aggregate with no GROUP BY
-- always yields exactly one row, so:
--       LIMIT 20  -> no-op, every matching group is returned
--       OFFSET 1  -> zero rows, so the whole result disappears
-- Measured on prod: OFFSET 0 returned all 10 groups (limit ignored); OFFSET 1
-- returned nothing. Pagination is silently broken either way, and the app does
-- pass p_offset. This version paginates in a subquery, where LIMIT/OFFSET apply
-- to rows, then aggregates the page.
--
-- ALSO FIXED HERE:
--   * activeNow was hardcoded to 0, so "Live now" and "N studying" always read
--     zero. Now counts group members present in user_presence within 5 minutes.
--   * memberCount recounted group_members per row instead of using the
--     maintained groups.member_count column (trg_sync_member_count keeps it
--     current), with a recount fallback when it is NULL.
--   * description, subjects, joinPolicy and visibility were not returned at
--     all, though the Discover card renders every one of them.
--   * Soft-deleted and inactive groups: deleted_at was checked, is_active was
--     not.
--   * p_limit/p_offset were interpolated unclamped; a huge limit was a free
--     table scan. Clamped to 1..50 and >= 0.
--
-- SAFETY: CREATE OR REPLACE FUNCTION only — no table, column, or row is
-- touched. Read-only function (SELECTs only). Reversible by replacing the
-- function again.
--
-- Static SQL throughout: the previous dynamic-SQL construction is what allowed
-- both original bugs to exist, and every filter here is expressible as a
-- parameterised predicate.

CREATE OR REPLACE FUNCTION public.community_discover_groups(
  p_query text DEFAULT ''::text,
  p_exam text DEFAULT NULL::text,
  p_target_year integer DEFAULT NULL::integer,
  p_subject text DEFAULT NULL::text,
  p_has_space boolean DEFAULT NULL::boolean,
  p_join_policy text DEFAULT NULL::text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $fn$
  WITH page AS (
    SELECT
      g.id,
      g.name,
      -- Prefer the stored slug; derive one only when it is absent.
      COALESCE(
        NULLIF(g.slug, ''),
        trim(both '-' from regexp_replace(lower(g.name), '[^a-z0-9]+', '-', 'g'))
      )                                              AS slug,
      g.description,
      g.exam,
      g.target_year,
      COALESCE(g.subjects, ARRAY[]::text[])          AS subjects,
      COALESCE(g.join_policy, 'request')             AS join_policy,
      g.visibility,
      COALESCE(g.visual_key, 0)                      AS visual_key,
      COALESCE(g.max_members, 30)                    AS max_members,
      -- member_count is maintained by trg_sync_member_count; recount only if
      -- it is NULL so this stays O(1) per row in the normal case.
      COALESCE(
        g.member_count,
        (SELECT count(*) FROM public.group_members gm WHERE gm.group_id = g.id)
      )::int                                         AS member_count,
      -- activeNow: members seen in the last 5 minutes. Was hardcoded 0.
      (
        SELECT count(*)
        FROM public.group_members gm2
        JOIN public.user_presence up ON up.user_id = gm2.user_id
        WHERE gm2.group_id = g.id
          AND COALESCE(up.last_beat_at, up.last_seen) > now() - interval '5 minutes'
          AND COALESCE(up.state, up.status, '') NOT IN ('offline', 'idle')
      )::int                                         AS active_now,
      g.created_at
    FROM public.groups g
    WHERE g.deleted_at IS NULL
      AND COALESCE(g.is_active, true) IS TRUE
      -- Private groups must not surface in Discover.
      AND COALESCE(g.visibility, 'public') <> 'private'
      AND (
        p_query IS NULL OR p_query = ''
        OR g.name ILIKE '%' || p_query || '%'
        OR COALESCE(g.description, '') ILIKE '%' || p_query || '%'
      )
      AND (p_exam IS NULL OR g.exam = p_exam)
      AND (p_target_year IS NULL OR g.target_year = p_target_year)
      AND (p_subject IS NULL OR p_subject = ANY(COALESCE(g.subjects, ARRAY[]::text[])))
      AND (p_join_policy IS NULL OR COALESCE(g.join_policy, 'request') = p_join_policy)
      AND (
        p_has_space IS NOT TRUE
        OR COALESCE(
             g.member_count,
             (SELECT count(*) FROM public.group_members gm3 WHERE gm3.group_id = g.id)
           ) < COALESCE(g.max_members, 30)
      )
    -- LIMIT/OFFSET belong here, on ROWS, not on the aggregate below.
    ORDER BY g.last_activity DESC NULLS LAST, g.created_at DESC
    LIMIT  LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',          page.id,
            'name',        page.name,
            'slug',        page.slug,
            'description', page.description,
            'exam',        page.exam,
            'targetYear',  page.target_year,
            'subjects',    to_jsonb(page.subjects),
            'joinPolicy',  page.join_policy,
            'visibility',  page.visibility,
            'visualKey',   page.visual_key,
            'memberCount', page.member_count,
            'maxMembers',  page.max_members,
            'activeNow',   page.active_now
          )
          ORDER BY page.created_at DESC
        )
        FROM page
      ),
      '[]'::jsonb
    )
  );
$fn$;

-- The GRANT signature must be (text,text,integer,text,boolean,text,integer,integer):
-- p_subject is TEXT, not integer. Migration 016 has this typo
-- ("...integer,integer,boolean...") and would fail with 42883 "function ...
-- does not exist" on that line, leaving the function replaced but the grant
-- unapplied — so anon/authenticated could lose EXECUTE depending on how the
-- file is run. Verified against prod:
--   community_discover_groups(text,text,integer,text,boolean,text,integer,integer)
GRANT EXECUTE ON FUNCTION public.community_discover_groups(text,text,integer,text,boolean,text,integer,integer) TO anon, authenticated;
