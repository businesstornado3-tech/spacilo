CREATE OR REPLACE FUNCTION public.admin_safety_queue()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_cases jsonb; v_controls jsonb;
BEGIN
  IF NOT public.is_support_staff() THEN
    RAISE EXCEPTION 'not_support_staff' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'severity_rank', x->>'created_at' DESC), '[]'::jsonb)
    INTO v_cases
    FROM (
      SELECT jsonb_build_object(
        'id', c.id, 'reference', c.reference, 'booking_id', c.booking_id,
        'renter_id', c.renter_id, 'host_id', c.host_id,
        'category', c.category, 'stage', c.stage, 'status', c.status,
        'summary', c.summary,
        'severity', c.safety_severity, 'source', c.safety_source,
        'safety_flagged_at', c.safety_flagged_at,
        'severity_note', c.safety_note,
        'severity_rank', CASE c.safety_severity
            WHEN 'critical' THEN '1' WHEN 'high' THEN '2'
            WHEN 'medium' THEN '3' ELSE '4' END,
        'created_at', c.created_at, 'last_activity_at', c.last_activity_at,
        'evidence_count', (SELECT count(*) FROM public.booking_support_case_evidence e
                            WHERE e.case_id = c.id),
        'booking_status', b.status,
        'payment_hold', COALESCE((SELECT bool_or(h.hold_dispute) FROM public.host_earnings h
                                   WHERE h.booking_id = c.booking_id), false)
      ) AS x
      FROM public.booking_support_cases c
      LEFT JOIN public.bookings b ON b.id = c.booking_id
      WHERE c.safety_severity IS NOT NULL
      ORDER BY c.created_at DESC
      LIMIT 200) s;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'scope', s.scope, 'subject_id', s.subject_id, 'state', s.state,
      'reason', s.reason, 'source', s.source, 'case_id', s.case_id,
      'created_at', s.created_at)), '[]'::jsonb)
    INTO v_controls
    FROM public.safety_suspensions s WHERE s.lifted_at IS NULL;

  RETURN jsonb_build_object('cases', v_cases, 'controls', v_controls, 'generated_at', now());
END $function$;