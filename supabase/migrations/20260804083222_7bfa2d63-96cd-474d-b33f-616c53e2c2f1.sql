-- Prompt 15: handover / evidence record around the existing booking lifecycle.

CREATE TYPE public.handover_stage AS ENUM ('check_in', 'check_out');
CREATE TYPE public.handover_issue_category AS ENUM (
  'items_differ', 'quantity_differs', 'condition_concern',
  'access_problem', 'restricted_item', 'other'
);

-- Which side of the booking this user is on (NULL when unrelated).
CREATE OR REPLACE FUNCTION public.booking_party_role(_booking_id uuid, _user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
           WHEN b.renter_id = _user_id THEN 'renter'
           WHEN b.host_id = _user_id THEN 'host'
           ELSE NULL
         END
  FROM public.bookings b
  WHERE b.id = _booking_id
$$;

CREATE OR REPLACE FUNCTION public.is_booking_participant(_booking_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.booking_party_role(_booking_id, _user_id) IS NOT NULL
$$;

-- Text-keyed variant for storage policies, where the folder is a string.
CREATE OR REPLACE FUNCTION public.is_booking_participant_text(_booking_id text, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  BEGIN
    v_id := _booking_id::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN public.is_booking_participant(v_id, _user_id);
END $$;

-- Evidence may only be added while the relevant lifecycle stage is open.
CREATE OR REPLACE FUNCTION public.booking_stage_open(_booking_id uuid, _stage public.handover_stage)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
           WHEN _stage = 'check_in' THEN b.status IN ('confirmed', 'active')
           ELSE b.status = 'active'
         END
  FROM public.bookings b
  WHERE b.id = _booking_id
$$;

REVOKE ALL ON FUNCTION public.booking_party_role(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_booking_participant(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_booking_participant_text(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.booking_stage_open(uuid, public.handover_stage) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booking_party_role(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_booking_participant(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_booking_participant_text(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.booking_stage_open(uuid, public.handover_stage) TO authenticated, service_role;

/* ------------------------------------------------------------ photos */

CREATE TABLE public.booking_evidence_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  stage public.handover_stage NOT NULL,
  uploaded_by uuid NOT NULL,
  uploader_role text NOT NULL CHECK (uploader_role IN ('renter','host')),
  storage_path text NOT NULL UNIQUE,
  caption text CHECK (caption IS NULL OR char_length(caption) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_evidence_photos_booking_idx
  ON public.booking_evidence_photos (booking_id, stage, created_at);

GRANT SELECT, INSERT ON public.booking_evidence_photos TO authenticated;
GRANT ALL ON public.booking_evidence_photos TO service_role;
ALTER TABLE public.booking_evidence_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants read booking evidence photos"
  ON public.booking_evidence_photos FOR SELECT TO authenticated
  USING (public.is_booking_participant(booking_id, auth.uid()));

CREATE POLICY "Participants add booking evidence photos"
  ON public.booking_evidence_photos FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND uploader_role = public.booking_party_role(booking_id, auth.uid())
    AND public.booking_stage_open(booking_id, stage)
  );

/* ------------------------------------------------------------- notes */

CREATE TABLE public.booking_condition_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  stage public.handover_stage NOT NULL,
  author_id uuid NOT NULL,
  author_role text NOT NULL CHECK (author_role IN ('renter','host')),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_condition_notes_booking_idx
  ON public.booking_condition_notes (booking_id, stage, created_at);

GRANT SELECT, INSERT ON public.booking_condition_notes TO authenticated;
GRANT ALL ON public.booking_condition_notes TO service_role;
ALTER TABLE public.booking_condition_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants read booking condition notes"
  ON public.booking_condition_notes FOR SELECT TO authenticated
  USING (public.is_booking_participant(booking_id, auth.uid()));

CREATE POLICY "Participants add booking condition notes"
  ON public.booking_condition_notes FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND author_role = public.booking_party_role(booking_id, auth.uid())
    AND public.booking_stage_open(booking_id, stage)
  );

/* ------------------------------------------------------------ issues */

CREATE TABLE public.booking_handover_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  stage public.handover_stage NOT NULL,
  reported_by uuid NOT NULL,
  reporter_role text NOT NULL CHECK (reporter_role IN ('renter','host')),
  category public.handover_issue_category NOT NULL,
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_review','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_handover_issues_booking_idx
  ON public.booking_handover_issues (booking_id, stage, created_at);

GRANT SELECT, INSERT ON public.booking_handover_issues TO authenticated;
GRANT ALL ON public.booking_handover_issues TO service_role;
ALTER TABLE public.booking_handover_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants read booking handover issues"
  ON public.booking_handover_issues FOR SELECT TO authenticated
  USING (public.is_booking_participant(booking_id, auth.uid()));

CREATE POLICY "Participants report booking handover issues"
  ON public.booking_handover_issues FOR INSERT TO authenticated
  WITH CHECK (
    reported_by = auth.uid()
    AND reporter_role = public.booking_party_role(booking_id, auth.uid())
    AND public.is_booking_participant(booking_id, auth.uid())
  );

CREATE TRIGGER booking_handover_issues_touch
  BEFORE UPDATE ON public.booking_handover_issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

/* --------------------------------------------------- storage policies */
-- Path: <booking_id>/<stage>/<uploader_id>/<file>

CREATE POLICY "Participants read booking evidence files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'booking-evidence'
    AND public.is_booking_participant_text((storage.foldername(name))[1], auth.uid())
  );

CREATE POLICY "Participants upload booking evidence files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'booking-evidence'
    AND public.is_booking_participant_text((storage.foldername(name))[1], auth.uid())
    AND (storage.foldername(name))[3] = auth.uid()::text
  );
