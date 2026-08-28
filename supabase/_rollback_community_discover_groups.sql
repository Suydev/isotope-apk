-- Captured from prod 2026-08-28T11:29:31.626Z before applying 019.
-- Run this file to restore the previous (broken) definition if ever needed.

CREATE OR REPLACE FUNCTION public.community_discover_groups(p_query text DEFAULT ''::text, p_exam text DEFAULT NULL::text, p_target_year integer DEFAULT NULL::integer, p_subject text DEFAULT NULL::text, p_has_space boolean DEFAULT NULL::boolean, p_join_policy text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sql text;
BEGIN
  v_sql := 'SELECT jsonb_agg(jsonb_build_object(
    ''id'', id, ''name'', name, ''slug'', lower(regexp_replace(name, ''[^a-z0-9]+'', ''-'', ''g'')),
    ''memberCount'', (SELECT COUNT(*) FROM public.group_members WHERE group_id = g.id),
    ''activeNow'', 0, ''visualKey'', visual_key, ''exam'', exam, ''targetYear'', target_year
  )) FROM public.groups g WHERE deleted_at IS NULL';
  IF p_query IS NOT NULL AND p_query != '' THEN
    v_sql := v_sql || ' AND (g.name ILIKE ''%' || replace(p_query, '''', '''''') || '%'' OR g.description ILIKE ''%' || replace(p_query, '''', '''''') || '%'')';
  END IF;
  IF p_exam IS NOT NULL THEN v_sql := v_sql || ' AND g.exam = ' || quote_literal(p_exam); END IF;
  IF p_target_year IS NOT NULL THEN v_sql := v_sql || ' AND g.target_year = ' || p_target_year::text; END IF;
  IF p_subject IS NOT NULL THEN v_sql := v_sql || ' AND ' || quote_literal(p_subject) || ' = ANY(g.subjects)'; END IF;
  IF p_has_space THEN v_sql := v_sql || ' AND (SELECT COUNT(*) FROM public.group_members WHERE group_id = g.id) < 30'; END IF;
  IF p_join_policy IS NOT NULL THEN v_sql := v_sql || ' AND g.join_policy = ' || quote_literal(p_join_policy); END IF;
  v_sql := v_sql || ' ORDER BY g.created_at DESC LIMIT ' || p_limit::text || ' OFFSET ' || p_offset::text;
  RETURN (SELECT jsonb_build_object('success', true, 'data', COALESCE((SELECT v_sql::jsonb), '[]'::jsonb)));
END;
$function$
;
