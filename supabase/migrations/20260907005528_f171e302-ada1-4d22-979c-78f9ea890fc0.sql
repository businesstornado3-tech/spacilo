CREATE OR REPLACE FUNCTION public.set_support_case_safety(p_case_id uuid, p_severity safety_severity, p_source safety_source, p_note text DEFAULT NULL::text)
 RETURNS booking_support_cases
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_case public.booking_support_cases;
  v_previous public.safety_severity;
BEGIN
  IF NOT public.is_support_staff() THEN
    RAISE EXCEPTION 'not_support_staff' USING ERRCODE = '42501';
  END IF;

  SELECT safety_severity INTO v_previous FROM public.booking_support_cases WHERE id = p_case_id;

  UPDATE public.booking_support_cases
     SET safety_severity = p_severity,
         safety_source = p_source,
         safety_note = COALESCE(p_note, safety_note),
         safety_flagged_at = COALESCE(safety_flagged_at, now()),
         last_activity_at = now(),
         updated_at = now()
   WHERE id = p_case_id
  RETURNING * INTO v_case;
  IF NOT FOUND THEN RAISE EXCEPTION 'case_not_found'; END IF;

  INSERT INTO public.booking_support_case_events (
    case_id, booking_id, actor_user_id, actor_role, event_type, visibility, internal_note, metadata)
  VALUES (
    p_case_id, v_case.booking_id, auth.uid(), 'support', 'support_note', 'internal',
    COALESCE(p_note, 'Safety severity recorded.'),
    jsonb_build_object(
      'kind', 'safety_severity_set',
      'previous_severity', v_previous,
      'severity', p_severity,
      'source', p_source));

  INSERT INTO public.policy_audit_events (actor_id, event_type, subject_type, subject_id, detail)
  VALUES (auth.uid(), 'SAFETY_SEVERITY_SET', 'support_case', p_case_id,
          jsonb_build_object('previous_severity', v_previous, 'severity', p_severity, 'source', p_source));

  RETURN v_case;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_safety_incident(p_case_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_case public.booking_support_cases;
  v_booking public.bookings;
  v_request public.storage_requests;
  v_space public.spaces;
  v_agreement public.storage_agreements;
  v_inventory_id uuid;
BEGIN
  IF NOT public.is_support_staff() THEN
    RAISE EXCEPTION 'not_support_staff' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_case FROM public.booking_support_cases WHERE id = p_case_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'case_not_found'; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = v_case.booking_id;
  SELECT * INTO v_request FROM public.storage_requests WHERE id = v_booking.request_id;
  SELECT * INTO v_space FROM public.spaces WHERE id = v_booking.space_id;

  SELECT * INTO v_agreement FROM public.storage_agreements
   WHERE booking_id = v_booking.id AND status NOT IN ('superseded', 'cancelled')
   ORDER BY created_at DESC LIMIT 1;
  IF v_agreement.id IS NULL THEN
    SELECT * INTO v_agreement FROM public.storage_agreements
     WHERE booking_id = v_booking.id ORDER BY created_at DESC LIMIT 1;
  END IF;

  v_inventory_id := v_request.inventory_id;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'case', jsonb_build_object(
      'id', v_case.id, 'reference', v_case.reference, 'category', v_case.category,
      'stage', v_case.stage, 'status', v_case.status, 'summary', v_case.summary,
      'description', v_case.description,
      'opened_by_user_id', v_case.opened_by_user_id, 'opened_by_role', v_case.opened_by_role,
      'assigned_to_user_id', v_case.assigned_to_user_id,
      'severity', v_case.safety_severity, 'source', v_case.safety_source,
      'severity_note', v_case.safety_note, 'safety_flagged_at', v_case.safety_flagged_at,
      'resolution_code', v_case.resolution_code, 'resolution_summary', v_case.resolution_summary,
      'financially_resolved', v_case.financially_resolved,
      'refund_total_pence', v_case.refund_total_pence,
      'created_at', v_case.created_at, 'last_activity_at', v_case.last_activity_at,
      'resolved_at', v_case.resolved_at, 'closed_at', v_case.closed_at),

    'renter', (
      SELECT jsonb_build_object(
        'user_id', v_case.renter_id,
        'display_name', p.display_name,
        'first_name', p.first_name,
        'last_name', p.last_name,
        'phone_verified', p.phone_verified,
        'member_since', p.created_at,
        'policy_acceptances', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', a.id, 'policy_version_id', a.policy_version_id, 'role', a.role,
            'context', a.context, 'accepted_at', a.accepted_at) ORDER BY a.accepted_at DESC), '[]'::jsonb)
          FROM public.policy_acceptances a WHERE a.user_id = v_case.renter_id),
        'declaration', v_booking.renter_declaration_snapshot)
      FROM public.profiles p WHERE p.id = v_case.renter_id),

    'host', (
      SELECT jsonb_build_object(
        'user_id', v_case.host_id,
        'display_name', p.display_name,
        'first_name', p.first_name,
        'last_name', p.last_name,
        'phone_verified', p.phone_verified,
        'member_since', p.created_at,
        'suitability', (
          SELECT jsonb_build_object(
            'space_id', s.space_id, 'attributes', s.attributes, 'host_notes', s.host_notes,
            'declaration_authority', s.declaration_authority,
            'declaration_compliance', s.declaration_compliance,
            'declaration_accuracy', s.declaration_accuracy,
            'declared_at', s.declared_at,
            'declared_policy_version_id', s.declared_policy_version_id)
          FROM public.space_suitability_profiles s WHERE s.space_id = v_booking.space_id),
        'suitability_snapshot', v_booking.space_suitability_snapshot)
      FROM public.profiles p WHERE p.id = v_case.host_id),

    'space', CASE WHEN v_space.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_space.id, 'title', v_space.title, 'space_type', v_space.space_type,
      'listing_status', v_space.listing_status, 'storage_mode', v_space.storage_mode,
      'address_line1', v_space.address_line1, 'address_line2', v_space.address_line2,
      'town', v_space.town, 'postcode', v_space.postcode,
      'postcode_district', v_space.postcode_district,
      'approximate_area', v_space.approximate_area,
      'latitude', v_space.latitude, 'longitude', v_space.longitude,
      'access_type', v_space.access_type, 'access_notes', v_space.access_notes,
      'accepted_categories', to_jsonb(v_space.accepted_categories),
      'host_restrictions', to_jsonb(v_space.host_restrictions),
      'restriction_notes', v_space.restriction_notes) END,

    'booking', CASE WHEN v_booking.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_booking.id, 'request_id', v_booking.request_id, 'space_id', v_booking.space_id,
      'status', v_booking.status,
      'space_title', v_booking.space_title_snapshot,
      'start_date', v_booking.start_date, 'end_date', v_booking.end_date,
      'created_at', v_booking.created_at,
      'paid_at', v_booking.paid_at, 'confirmed_at', v_booking.confirmed_at,
      'activated_at', v_booking.activated_at, 'completed_at', v_booking.completed_at,
      'cancelled_at', v_booking.cancelled_at,
      'renter_handover_confirmed_at', v_booking.renter_handover_confirmed_at,
      'host_handover_confirmed_at', v_booking.host_handover_confirmed_at,
      'renter_collection_confirmed_at', v_booking.renter_collection_confirmed_at,
      'host_collection_confirmed_at', v_booking.host_collection_confirmed_at,
      'items_finalised', (v_booking.renter_handover_confirmed_at IS NOT NULL
                          AND v_booking.host_handover_confirmed_at IS NOT NULL),
      'storage_started', (v_booking.activated_at IS NOT NULL)) END,

    'request', CASE WHEN v_request.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_request.id, 'status', v_request.status, 'inventory_id', v_request.inventory_id,
      'requested_start_date', v_request.requested_start_date,
      'requested_end_date', v_request.requested_end_date,
      'renter_note', v_request.renter_note,
      'created_at', v_request.created_at, 'responded_at', v_request.responded_at,
      'item_count', v_request.inventory_item_count_snapshot) END,

    'agreement', CASE WHEN v_agreement.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_agreement.id, 'status', v_agreement.status,
      'agreement_version', v_agreement.agreement_version,
      'agreement_version_id', v_agreement.agreement_version_id,
      'renter_accepted_at', v_agreement.renter_accepted_at,
      'host_accepted_at', v_agreement.host_accepted_at,
      'activated_at', v_agreement.activated_at,
      'superseded_at', v_agreement.superseded_at,
      'cancelled_at', v_agreement.cancelled_at,
      'acceptances', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'party', a.party, 'user_id', a.user_id, 'accepted_at', a.accepted_at,
          'agreement_version', a.agreement_version,
          'agreement_version_id', a.agreement_version_id) ORDER BY a.accepted_at), '[]'::jsonb)
        FROM public.storage_agreement_acceptances a WHERE a.agreement_id = v_agreement.id)) END,

    'items', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'item_name', i.item_name, 'category', i.category,
        'quantity', i.quantity, 'notes', i.notes,
        'length_cm', i.length_cm, 'width_cm', i.width_cm, 'height_cm', i.height_cm,
        'estimated_total_volume_m3', i.estimated_total_volume_m3,
        'fragile', i.fragile, 'size_source', i.size_source,
        'confidence_score', i.confidence_score,
        'created_manually', i.created_manually,
        'ai_detected', i.ai_detected, 'ai_confirmed', i.ai_confirmed,
        'hazard_signals', i.hazard_signals,
        'policy_category', i.policy_category,
        'policy_provenance', i.policy_provenance,
        'policy_confirmed_at', i.policy_confirmed_at,
        'policy_note', i.policy_note,
        'created_at', i.created_at, 'updated_at', i.updated_at,
        'photo_path', (SELECT ph.storage_path FROM public.inventory_photos ph
                        WHERE ph.id = i.source_photo_id),
        'photo_analysed_at', (SELECT ph.analysed_at FROM public.inventory_photos ph
                        WHERE ph.id = i.source_photo_id)
      ) ORDER BY (i.hazard_signals IS NOT NULL) DESC, i.created_at), '[]'::jsonb)
      FROM public.inventory_items i WHERE i.inventory_id = v_inventory_id),

    'policy', jsonb_build_object(
      'policy_version', v_booking.policy_version_snapshot,
      'policy_version_id', v_booking.policy_version_id_snapshot,
      'screening', v_booking.policy_screening_snapshot,
      'compatibility', v_booking.compatibility_snapshot,
      'request_policy_version', v_request.policy_version_snapshot,
      'request_screening', v_request.policy_screening_snapshot,
      'rules', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', r.id, 'rule_key', r.rule_key, 'category', r.category,
          'subcategory', r.subcategory, 'decision', r.decision, 'severity', r.severity,
          'requires_user_confirmation', r.requires_user_confirmation,
          'requires_staff_review', r.requires_staff_review,
          'internal_reason_code', r.internal_reason_code,
          'renter_message', r.renter_message) ORDER BY r.sort_order), '[]'::jsonb)
        FROM public.storage_policy_rules r
        WHERE r.policy_version_id = v_booking.policy_version_id_snapshot
          AND r.is_active
          AND r.category::text IN (
            SELECT DISTINCT i.policy_category FROM public.inventory_items i
             WHERE i.inventory_id = v_inventory_id AND i.policy_category IS NOT NULL))),

    'evidence', jsonb_build_object(
      'case_photos', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', e.id, 'storage_path', e.storage_path, 'mime_type', e.mime_type,
          'file_size', e.file_size, 'caption', e.caption,
          'uploaded_by_user_id', e.uploaded_by_user_id, 'uploaded_by_role', e.uploaded_by_role,
          'created_at', e.created_at) ORDER BY e.created_at), '[]'::jsonb)
        FROM public.booking_support_case_evidence e WHERE e.case_id = v_case.id),
      'handover_photos', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', p.id, 'stage', p.stage, 'storage_path', p.storage_path,
          'caption', p.caption, 'uploader_role', p.uploader_role,
          'created_at', p.created_at) ORDER BY p.created_at), '[]'::jsonb)
        FROM public.booking_evidence_photos p WHERE p.booking_id = v_case.booking_id),
      'condition_notes', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', n.id, 'stage', n.stage, 'author_role', n.author_role,
          'body', n.body, 'created_at', n.created_at) ORDER BY n.created_at), '[]'::jsonb)
        FROM public.booking_condition_notes n WHERE n.booking_id = v_case.booking_id),
      'handover_issues', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', h.id, 'stage', h.stage, 'category', h.category,
          'reporter_role', h.reporter_role, 'description', h.description,
          'status', h.status, 'created_at', h.created_at) ORDER BY h.created_at), '[]'::jsonb)
        FROM public.booking_handover_issues h WHERE h.booking_id = v_case.booking_id)),

    'controls', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'scope', s.scope, 'subject_id', s.subject_id, 'state', s.state,
        'reason', s.reason, 'source', s.source, 'case_id', s.case_id,
        'created_by', s.created_by, 'created_at', s.created_at,
        'lifted_at', s.lifted_at, 'lifted_by', s.lifted_by,
        'lift_reason', s.lift_reason) ORDER BY s.created_at DESC), '[]'::jsonb)
      FROM public.safety_suspensions s
      WHERE s.case_id = v_case.id
         OR s.subject_id IN (v_case.booking_id, v_booking.space_id, v_case.renter_id, v_case.host_id)),

    'payment_holds', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', h.id, 'status', h.status, 'host_entitlement_pence', h.host_entitlement_pence,
        'currency', h.currency, 'hold_dispute', h.hold_dispute, 'hold_refund', h.hold_refund,
        'hold_review', h.hold_review, 'blocked_reason', h.blocked_reason,
        'period_label', h.period_label, 'created_at', h.created_at) ORDER BY h.created_at), '[]'::jsonb)
      FROM public.host_earnings h WHERE h.booking_id = v_case.booking_id),

    'events', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'event_type', e.event_type, 'visibility', e.visibility,
        'actor_user_id', e.actor_user_id, 'actor_role', e.actor_role,
        'public_message', e.public_message, 'internal_note', e.internal_note,
        'metadata', e.metadata, 'created_at', e.created_at) ORDER BY e.created_at), '[]'::jsonb)
      FROM public.booking_support_case_events e WHERE e.case_id = v_case.id),

    'audit', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'event_type', a.event_type, 'subject_type', a.subject_type,
        'subject_id', a.subject_id, 'actor_id', a.actor_id, 'detail', a.detail,
        'created_at', a.created_at) ORDER BY a.created_at DESC), '[]'::jsonb)
      FROM public.policy_audit_events a
      WHERE a.subject_id IN (v_case.id, v_case.booking_id, v_booking.space_id,
                             v_case.renter_id, v_case.host_id))
  );
END $function$;