-- 016_fix_community_discover_groups.sql
-- Root cause of community black screen #1: the RPC built v_sql but never
-- executed it — it cast the QUERY TEXT to jsonb ("Token \"SELECT\" is
-- invalid" / 22P02). It also ordered by g.created_at inside an aggregate
-- query without GROUP BY (42803). This version EXECUTEs the statement,
-- orders by max(created_at) (aggregate-safe), clamps limit/offset, and
-- interpolates parameters with format() %L/%s (injection-safe, SECURITY DEFINER).

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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_sql text;
  v_result jsonb;
BEGIN
  v_sql := 'SELECT COALESCE(jsonb_agg(jsonb_build_object('
    || '''id'', g.id, ''name'', g.name, ''slug'', lower(regexp_replace(g.name, ''[^a-z0-9]+'', ''-'', ''g'')),'
    || '''memberCount'', (SELECT COUNT(*) FROM public.group_members gm WHERE gm.group_id = g.id),'
    || '''activeNow'', 0, ''visualKey'', g.visual_key, ''exam'', g.exam, ''targetYear'', g.target_year'
    || ')), ''[]''::jsonb) FROM public.groups g WHERE g.deleted_at IS NULL';
  IF p_query IS NOT NULL AND p_query <> '' THEN
    v_sql := v_sql || format(' AND (g.name ILIKE %L OR COALESCE(g.description, '''') ILIKE %L)', '%' || p_query || '%', '%' || p_query || '%');
  END IF;
  IF p_exam IS NOT NULL THEN
    v_sql := v_sql || format(' AND g.exam = %L', p_exam);
  END IF;
  IF p_target_year IS NOT NULL THEN
    v_sql := v_sql || ' AND g.target_year = ' || p_target_year::int;
  END IF;
  IF p_subject IS NOT NULL THEN
    v_sql := v_sql || format(' AND %L = ANY(g.subjects)', p_subject);
  END IF;
  IF p_has_space IS TRUE THEN
    v_sql := v_sql || ' AND (SELECT COUNT(*) FROM public.group_members gm2 WHERE gm2.group_id = g.id) < 30';
  END IF;
  IF p_join_policy IS NOT NULL THEN
    v_sql := v_sql || format(' AND g.join_policy = %L', p_join_policy);
  END IF;
  v_sql := v_sql || ' ORDER BY max(g.created_at) DESC LIMIT ' || p_limit::int || ' OFFSET ' || p_offset::int;
  EXECUTE v_sql INTO v_result;
  RETURN jsonb_build_object('success', true, 'data', COALESCE(v_result, '[]'::jsonb));
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.community_discover_groups(text,text,integer,integer,boolean,text,integer,integer) TO anon, authenticated;

-- NOTE: apply this as a SINGLE STATEMENT if using tools that split on ';'
-- naively (the function body contains no semicolons inside string literals,
-- but the trailing GRANT must be run separately).
