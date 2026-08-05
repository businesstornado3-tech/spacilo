-- =========================================================================
-- Prompt 19: reviews, ratings and marketplace reputation
-- =========================================================================

CREATE TYPE public.review_moderation_status AS ENUM ('visible', 'under_review', 'hidden');
CREATE TYPE public.review_report_reason AS ENUM (
  'personal_information', 'abusive', 'discriminatory', 'unrelated', 'spam', 'other'
);
CREATE TYPE public.review_report_status AS ENUM ('open', 'actioned', 'dismissed');

-- Canonical review window length (days) -----------------------------------
CREATE OR REPLACE FUNCTION public.stow_review_window_days()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 14 $$;

-- ------------------------------------------------------------------ table
CREATE TABLE public.booking_reviews (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id              uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  space_id                uuid NOT NULL REFERENCES public.spaces(id) ON DELETE RESTRICT,
  reviewer_id             uuid NOT NULL,
  reviewee_id             uuid NOT NULL,
  reviewer_role           text NOT NULL CHECK (reviewer_role IN ('renter', 'host')),
  rating                  smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text             text CHECK (review_text IS NULL OR char_length(review_text) BETWEEN 10 AND 1000),
  rating_accuracy         smallint CHECK (rating_accuracy IS NULL OR rating_accuracy BETWEEN 1 AND 5),
  rating_access           smallint CHECK (rating_access IS NULL OR rating_access BETWEEN 1 AND 5),
  rating_communication    smallint CHECK (rating_communication IS NULL OR rating_communication BETWEEN 1 AND 5),
  rating_condition        smallint CHECK (rating_condition IS NULL OR rating_condition BETWEEN 1 AND 5),
  submitted_at            timestamptz NOT NULL DEFAULT now(),
  review_window_closes_at timestamptz NOT NULL,
  published_at            timestamptz,
  moderation_status       public.review_moderation_status NOT NULL DEFAULT 'visible',
  moderation_reason       text,
  moderated_by            uuid,
  moderated_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_reviews_no_self_review CHECK (reviewer_id <> reviewee_id),
  CONSTRAINT booking_reviews_one_per_reviewer UNIQUE (booking_id, reviewer_id),
  CONSTRAINT booking_reviews_one_per_direction UNIQUE (booking_id, reviewer_role)
);

CREATE INDEX booking_reviews_booking_idx   ON public.booking_reviews (booking_id);
CREATE INDEX booking_reviews_reviewer_idx  ON public.booking_reviews (reviewer_id);
CREATE INDEX booking_reviews_reviewee_idx  ON public.booking_reviews (reviewee_id);
CREATE INDEX booking_reviews_space_public_idx
  ON public.booking_reviews (space_id, submitted_at DESC)
  WHERE reviewer_role = 'renter';
CREATE INDEX booking_reviews_moderation_idx ON public.booking_reviews (moderation_status);

-- --------------------------------------------------------------- reports
CREATE TABLE public.booking_review_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id    uuid NOT NULL REFERENCES public.booking_reviews(id) ON DELETE CASCADE,
  booking_id   uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  reported_by  uuid NOT NULL,
  reason       public.review_report_reason NOT NULL,
  details      text CHECK (details IS NULL OR char_length(details) <= 1000),
  status       public.review_report_status NOT NULL DEFAULT 'open',
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  CONSTRAINT booking_review_reports_one_per_reporter UNIQUE (review_id, reported_by)
);
CREATE INDEX booking_review_reports_review_idx ON public.booking_review_reports (review_id);
CREATE INDEX booking_review_reports_status_idx ON public.booking_review_reports (status, created_at DESC);

-- ----------------------------------------------------------- audit events
CREATE TABLE public.booking_review_moderation_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id    uuid NOT NULL REFERENCES public.booking_reviews(id) ON DELETE CASCADE,
  actor_id     uuid NOT NULL,
  action       text NOT NULL CHECK (action IN ('hide', 'restore', 'flag', 'report')),
  reason       text,
  from_status  public.review_moderation_status,
  to_status    public.review_moderation_status,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_review_moderation_events_review_idx
  ON public.booking_review_moderation_events (review_id, created_at DESC);

-- ------------------------------------------------------------------ grants
GRANT SELECT ON public.booking_reviews TO authenticated;
GRANT ALL ON public.booking_reviews TO service_role;
GRANT SELECT ON public.booking_review_reports TO authenticated;
GRANT ALL ON public.booking_review_reports TO service_role;
GRANT SELECT ON public.booking_review_moderation_events TO authenticated;
GRANT ALL ON public.booking_review_moderation_events TO service_role;

ALTER TABLE public.booking_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_review_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_review_moderation_events ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- Publication rule (double blind), evaluated with server time only.
-- SECURITY DEFINER so RLS on booking_reviews cannot recurse.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.review_publication_ready(
  _booking_id uuid, _reviewer_id uuid, _window_closes_at timestamptz
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT now() >= _window_closes_at
      OR EXISTS (
           SELECT 1 FROM public.booking_reviews r
           WHERE r.booking_id = _booking_id AND r.reviewer_id <> _reviewer_id
         );
$$;
REVOKE EXECUTE ON FUNCTION public.review_publication_ready(uuid, uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_publication_ready(uuid, uuid, timestamptz) TO authenticated, service_role;

-- =========================================================================
-- RLS: SELECT only. No participant UPDATE/DELETE policy exists anywhere,
-- so reviews are immutable to every non-service caller.
-- =========================================================================
CREATE POLICY "Authors can read their own review"
  ON public.booking_reviews FOR SELECT TO authenticated
  USING (reviewer_id = auth.uid());

CREATE POLICY "Participants read the counterpart review once published"
  ON public.booking_reviews FOR SELECT TO authenticated
  USING (
    reviewer_id <> auth.uid()
    AND public.is_booking_participant(booking_id, auth.uid())
    AND moderation_status <> 'hidden'
    AND public.review_publication_ready(booking_id, reviewer_id, review_window_closes_at)
  );

CREATE POLICY "Support staff read all reviews"
  ON public.booking_reviews FOR SELECT TO authenticated
  USING (public.is_support_staff(auth.uid()));

CREATE POLICY "Reporters and staff read review reports"
  ON public.booking_review_reports FOR SELECT TO authenticated
  USING (reported_by = auth.uid() OR public.is_support_staff(auth.uid()));

CREATE POLICY "Staff read moderation audit"
  ON public.booking_review_moderation_events FOR SELECT TO authenticated
  USING (public.is_support_staff(auth.uid()));

-- =========================================================================
-- submit_booking_review — the only way a review is created.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.submit_booking_review(
  p_booking_id      uuid,
  p_rating          smallint,
  p_review_text     text DEFAULT NULL,
  p_accuracy        smallint DEFAULT NULL,
  p_access          smallint DEFAULT NULL,
  p_communication   smallint DEFAULT NULL,
  p_condition       smallint DEFAULT NULL
) RETURNS public.booking_reviews
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_booking   public.bookings%ROWTYPE;
  v_role      text;
  v_reviewee  uuid;
  v_closes    timestamptz;
  v_text      text;
  v_review    public.booking_reviews%ROWTYPE;
  v_other     public.booking_reviews%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  IF v_uid = v_booking.renter_id THEN
    v_role := 'renter'; v_reviewee := v_booking.host_id;
  ELSIF v_uid = v_booking.host_id THEN
    v_role := 'host'; v_reviewee := v_booking.renter_id;
  ELSE
    RAISE EXCEPTION 'not_a_booking_participant';
  END IF;

  -- Idempotent: a repeat submission returns the existing immutable review.
  SELECT * INTO v_review FROM public.booking_reviews
   WHERE booking_id = p_booking_id AND reviewer_id = v_uid;
  IF FOUND THEN RETURN v_review; END IF;

  -- Canonical completion only (Prompt 14). Never dates, payment or client state.
  IF v_booking.status <> 'completed' THEN RAISE EXCEPTION 'booking_not_completed'; END IF;

  v_closes := COALESCE(v_booking.completed_at, v_booking.updated_at)
              + (public.stow_review_window_days() || ' days')::interval;
  IF now() >= v_closes THEN RAISE EXCEPTION 'review_window_closed'; END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'rating_invalid';
  END IF;

  v_text := NULLIF(btrim(regexp_replace(COALESCE(p_review_text, ''), '\s+', ' ', 'g')), '');
  IF v_text IS NOT NULL AND char_length(v_text) < 10 THEN RAISE EXCEPTION 'review_text_too_short'; END IF;
  IF v_text IS NOT NULL AND char_length(v_text) > 1000 THEN RAISE EXCEPTION 'review_text_too_long'; END IF;

  INSERT INTO public.booking_reviews (
    booking_id, space_id, reviewer_id, reviewee_id, reviewer_role, rating, review_text,
    rating_accuracy, rating_access, rating_communication, rating_condition,
    review_window_closes_at
  ) VALUES (
    p_booking_id, v_booking.space_id, v_uid, v_reviewee, v_role, p_rating, v_text,
    CASE WHEN v_role = 'renter' THEN p_accuracy END,
    CASE WHEN v_role = 'renter' THEN p_access END,
    CASE WHEN v_role = 'renter' THEN p_communication END,
    CASE WHEN v_role = 'renter' THEN p_condition END,
    v_closes
  )
  ON CONFLICT (booking_id, reviewer_id) DO NOTHING
  RETURNING * INTO v_review;

  IF v_review.id IS NULL THEN
    SELECT * INTO v_review FROM public.booking_reviews
     WHERE booking_id = p_booking_id AND reviewer_id = v_uid;
    RETURN v_review;
  END IF;

  -- Both sides in: stamp publication on both, deterministically.
  SELECT * INTO v_other FROM public.booking_reviews
   WHERE booking_id = p_booking_id AND reviewer_id <> v_uid;
  IF FOUND THEN
    UPDATE public.booking_reviews SET published_at = COALESCE(published_at, now())
     WHERE booking_id = p_booking_id;
    SELECT * INTO v_review FROM public.booking_reviews WHERE id = v_review.id;
  END IF;

  RETURN v_review;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_booking_review(uuid, smallint, text, smallint, smallint, smallint, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_booking_review(uuid, smallint, text, smallint, smallint, smallint, smallint) TO authenticated;

-- =========================================================================
-- get_booking_review_state — server-authoritative eligibility for a booking.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_booking_review_state(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_booking  public.bookings%ROWTYPE;
  v_role     text;
  v_closes   timestamptz;
  v_mine     public.booking_reviews%ROWTYPE;
  v_theirs   public.booking_reviews%ROWTYPE;
  v_ready    boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  IF v_uid = v_booking.renter_id THEN v_role := 'renter';
  ELSIF v_uid = v_booking.host_id THEN v_role := 'host';
  ELSE RAISE EXCEPTION 'not_a_booking_participant';
  END IF;

  v_closes := COALESCE(v_booking.completed_at, v_booking.updated_at)
              + (public.stow_review_window_days() || ' days')::interval;

  SELECT * INTO v_mine FROM public.booking_reviews
   WHERE booking_id = p_booking_id AND reviewer_id = v_uid;
  SELECT * INTO v_theirs FROM public.booking_reviews
   WHERE booking_id = p_booking_id AND reviewer_id <> v_uid;

  v_ready := (v_mine.id IS NOT NULL AND v_theirs.id IS NOT NULL) OR now() >= v_closes;

  RETURN jsonb_build_object(
    'booking_id', p_booking_id,
    'viewer_role', v_role,
    'server_time', now(),
    'booking_completed', v_booking.status = 'completed',
    'completed_at', v_booking.completed_at,
    'window_opens_at', COALESCE(v_booking.completed_at, v_booking.updated_at),
    'window_closes_at', v_closes,
    'window_open', v_booking.status = 'completed' AND now() < v_closes,
    'can_review', v_booking.status = 'completed' AND now() < v_closes AND v_mine.id IS NULL,
    'my_review', CASE WHEN v_mine.id IS NULL THEN NULL ELSE to_jsonb(v_mine) END,
    -- Counterpart content is withheld entirely until the publication rule is met.
    'counterpart_review', CASE
        WHEN v_theirs.id IS NULL OR NOT v_ready OR v_theirs.moderation_status = 'hidden' THEN NULL
        ELSE jsonb_build_object(
          'id', v_theirs.id,
          'rating', v_theirs.rating,
          'review_text', v_theirs.review_text,
          'reviewer_role', v_theirs.reviewer_role,
          'submitted_at', v_theirs.submitted_at,
          'rating_accuracy', v_theirs.rating_accuracy,
          'rating_access', v_theirs.rating_access,
          'rating_communication', v_theirs.rating_communication,
          'rating_condition', v_theirs.rating_condition,
          'author_name', (SELECT COALESCE(p.display_name, p.first_name) FROM public.profiles p WHERE p.id = v_theirs.reviewer_id)
        ) END,
    'counterpart_hidden_by_moderation',
      v_theirs.id IS NOT NULL AND v_ready AND v_theirs.moderation_status = 'hidden',
    'my_review_published', v_mine.id IS NOT NULL AND v_ready
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_booking_review_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_booking_review_state(uuid) TO authenticated;

-- =========================================================================
-- Public read surface. Only renter -> host/space reviews, published and
-- moderation-visible. Safe columns only: no booking, payment or contact data.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_space_reviews(
  p_space_id uuid, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0
) RETURNS TABLE (
  id uuid, rating smallint, review_text text, submitted_at timestamptz,
  author_name text,
  rating_accuracy smallint, rating_access smallint,
  rating_communication smallint, rating_condition smallint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.rating, r.review_text, r.submitted_at,
         COALESCE(p.display_name, p.first_name, 'Renter') AS author_name,
         r.rating_accuracy, r.rating_access, r.rating_communication, r.rating_condition
    FROM public.booking_reviews r
    LEFT JOIN public.profiles p ON p.id = r.reviewer_id
   WHERE r.space_id = p_space_id
     AND r.reviewer_role = 'renter'
     AND r.moderation_status <> 'hidden'
     AND public.review_publication_ready(r.booking_id, r.reviewer_id, r.review_window_closes_at)
   ORDER BY r.submitted_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;
GRANT EXECUTE ON FUNCTION public.get_space_reviews(uuid, integer, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_space_review_summary(p_space_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH eligible AS (
    SELECT r.rating FROM public.booking_reviews r
     WHERE r.space_id = p_space_id
       AND r.reviewer_role = 'renter'
       AND r.moderation_status <> 'hidden'
       AND public.review_publication_ready(r.booking_id, r.reviewer_id, r.review_window_closes_at)
  )
  SELECT jsonb_build_object(
    'review_count', (SELECT count(*) FROM eligible),
    'average_rating', (SELECT round(avg(rating)::numeric, 2) FROM eligible),
    'distribution', jsonb_build_object(
      '5', (SELECT count(*) FROM eligible WHERE rating = 5),
      '4', (SELECT count(*) FROM eligible WHERE rating = 4),
      '3', (SELECT count(*) FROM eligible WHERE rating = 3),
      '2', (SELECT count(*) FROM eligible WHERE rating = 2),
      '1', (SELECT count(*) FROM eligible WHERE rating = 1)
    ),
    'completed_bookings', (
      SELECT count(*) FROM public.bookings b
       WHERE b.space_id = p_space_id AND b.status = 'completed'
    )
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_space_review_summary(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_host_reputation(p_host_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH eligible AS (
    SELECT r.rating FROM public.booking_reviews r
     WHERE r.reviewee_id = p_host_id
       AND r.reviewer_role = 'renter'
       AND r.moderation_status <> 'hidden'
       AND public.review_publication_ready(r.booking_id, r.reviewer_id, r.review_window_closes_at)
  )
  SELECT jsonb_build_object(
    'review_count', (SELECT count(*) FROM eligible),
    'average_rating', (SELECT round(avg(rating)::numeric, 2) FROM eligible),
    'completed_bookings', (
      SELECT count(*) FROM public.bookings b
       WHERE b.host_id = p_host_id AND b.status = 'completed'
    )
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_host_reputation(uuid) TO anon, authenticated, service_role;

-- Renter reputation is deliberately NOT granted to anon.
CREATE OR REPLACE FUNCTION public.get_renter_reputation(p_renter_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH eligible AS (
    SELECT r.rating FROM public.booking_reviews r
     WHERE r.reviewee_id = p_renter_id
       AND r.reviewer_role = 'host'
       AND r.moderation_status <> 'hidden'
       AND public.review_publication_ready(r.booking_id, r.reviewer_id, r.review_window_closes_at)
  )
  SELECT jsonb_build_object(
    'review_count', (SELECT count(*) FROM eligible),
    'average_rating', (SELECT round(avg(rating)::numeric, 2) FROM eligible),
    'completed_bookings', (
      SELECT count(*) FROM public.bookings b
       WHERE b.renter_id = p_renter_id AND b.status = 'completed'
    )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.get_renter_reputation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_renter_reputation(uuid) TO authenticated, service_role;

-- =========================================================================
-- report_booking_review — never hides anything on its own.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.report_booking_review(
  p_review_id uuid,
  p_reason    public.review_report_reason,
  p_details   text DEFAULT NULL
) RETURNS public.booking_review_reports
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_review public.booking_reviews%ROWTYPE;
  v_report public.booking_review_reports%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_review FROM public.booking_reviews WHERE id = p_review_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'review_not_found'; END IF;

  IF NOT (public.is_booking_participant(v_review.booking_id, v_uid) OR public.is_support_staff(v_uid)) THEN
    RAISE EXCEPTION 'not_a_booking_participant';
  END IF;

  -- You can only report something you are allowed to see.
  IF v_review.reviewer_id <> v_uid
     AND NOT public.review_publication_ready(v_review.booking_id, v_review.reviewer_id, v_review.review_window_closes_at) THEN
    RAISE EXCEPTION 'review_not_visible';
  END IF;

  SELECT * INTO v_report FROM public.booking_review_reports
   WHERE review_id = p_review_id AND reported_by = v_uid;
  IF FOUND THEN RETURN v_report; END IF;

  INSERT INTO public.booking_review_reports (review_id, booking_id, reported_by, reason, details)
  VALUES (p_review_id, v_review.booking_id, v_uid, p_reason,
          NULLIF(btrim(COALESCE(p_details, '')), ''))
  ON CONFLICT (review_id, reported_by) DO NOTHING
  RETURNING * INTO v_report;

  IF v_report.id IS NULL THEN
    SELECT * INTO v_report FROM public.booking_review_reports
     WHERE review_id = p_review_id AND reported_by = v_uid;
    RETURN v_report;
  END IF;

  INSERT INTO public.booking_review_moderation_events (review_id, actor_id, action, reason, from_status, to_status)
  VALUES (p_review_id, v_uid, 'report', p_reason::text, v_review.moderation_status, v_review.moderation_status);

  RETURN v_report;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.report_booking_review(uuid, public.review_report_reason, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_booking_review(uuid, public.review_report_reason, text) TO authenticated;

-- =========================================================================
-- moderate_booking_review — support/admin only, audited, never rewrites text.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.moderate_booking_review(
  p_review_id uuid,
  p_action    text,
  p_reason    text DEFAULT NULL
) RETURNS public.booking_reviews
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_review public.booking_reviews%ROWTYPE;
  v_from   public.review_moderation_status;
  v_to     public.review_moderation_status;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_support_staff(v_uid) THEN RAISE EXCEPTION 'not_support_staff'; END IF;

  SELECT * INTO v_review FROM public.booking_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review_not_found'; END IF;

  v_from := v_review.moderation_status;
  v_to := CASE p_action
            WHEN 'hide' THEN 'hidden'::public.review_moderation_status
            WHEN 'restore' THEN 'visible'::public.review_moderation_status
            WHEN 'flag' THEN 'under_review'::public.review_moderation_status
            ELSE NULL
          END;
  IF v_to IS NULL THEN RAISE EXCEPTION 'moderation_action_invalid'; END IF;
  IF p_action = 'hide' AND NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'moderation_reason_required';
  END IF;

  -- Only moderation state changes here. rating and review_text are untouched.
  UPDATE public.booking_reviews
     SET moderation_status = v_to,
         moderation_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''),
         moderated_by = v_uid,
         moderated_at = now()
   WHERE id = p_review_id
  RETURNING * INTO v_review;

  INSERT INTO public.booking_review_moderation_events (review_id, actor_id, action, reason, from_status, to_status)
  VALUES (p_review_id, v_uid, p_action, NULLIF(btrim(COALESCE(p_reason, '')), ''), v_from, v_to);

  UPDATE public.booking_review_reports
     SET status = CASE WHEN p_action = 'hide' THEN 'actioned'::public.review_report_status
                       WHEN p_action = 'restore' THEN 'dismissed'::public.review_report_status
                       ELSE status END,
         resolved_at = CASE WHEN p_action IN ('hide', 'restore') THEN now() ELSE resolved_at END
   WHERE review_id = p_review_id AND status = 'open' AND p_action IN ('hide', 'restore');

  RETURN v_review;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.moderate_booking_review(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_booking_review(uuid, text, text) TO authenticated;

-- =========================================================================
-- Staff moderation queue.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.list_reported_reviews(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_support_staff(v_uid) THEN
    RAISE EXCEPTION 'not_support_staff';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.last_reported_at DESC)
      FROM (
        SELECT r.id, r.booking_id, r.space_id, r.reviewer_role, r.rating, r.review_text,
               r.submitted_at, r.moderation_status, r.moderation_reason, r.moderated_at,
               count(rep.id) AS report_count,
               max(rep.created_at) AS last_reported_at,
               jsonb_agg(jsonb_build_object('reason', rep.reason, 'details', rep.details,
                                            'status', rep.status, 'created_at', rep.created_at)
                         ORDER BY rep.created_at DESC) AS reports
          FROM public.booking_reviews r
          JOIN public.booking_review_reports rep ON rep.review_id = r.id
         GROUP BY r.id
         LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
      ) t
  ), '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.list_reported_reviews(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_reported_reviews(integer) TO authenticated;