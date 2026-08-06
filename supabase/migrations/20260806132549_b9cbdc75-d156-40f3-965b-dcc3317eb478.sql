
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS renter_last_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS host_last_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS renter_archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS host_archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'visible';

DO $$ BEGIN
  ALTER TABLE public.conversations
    ADD CONSTRAINT conversations_moderation_status_check
    CHECK (moderation_status IN ('visible','under_review','hidden'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.conversation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('abusive','spam','off_platform','personal_information','scam','other')),
  details text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.conversation_reports TO authenticated;
GRANT ALL ON public.conversation_reports TO service_role;
ALTER TABLE public.conversation_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reporters and staff read conversation reports" ON public.conversation_reports;
CREATE POLICY "reporters and staff read conversation reports"
  ON public.conversation_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.is_support_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  inapp_bookings boolean NOT NULL DEFAULT true,
  inapp_messages boolean NOT NULL DEFAULT true,
  inapp_payments boolean NOT NULL DEFAULT true,
  inapp_reviews boolean NOT NULL DEFAULT true,
  inapp_announcements boolean NOT NULL DEFAULT true,
  email_bookings boolean NOT NULL DEFAULT true,
  email_messages boolean NOT NULL DEFAULT true,
  email_payments boolean NOT NULL DEFAULT true,
  email_reviews boolean NOT NULL DEFAULT false,
  email_announcements boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own notification preferences" ON public.notification_preferences;
CREATE POLICY "own notification preferences"
  ON public.notification_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.list_my_conversations(p_archived boolean DEFAULT false)
RETURNS TABLE (
  id uuid,
  booking_id uuid,
  space_id uuid,
  space_title text,
  cover_path text,
  counterpart_name text,
  counterpart_role text,
  booking_status text,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count integer,
  archived boolean,
  moderation_status text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH mine AS (
    SELECT c.*, (c.host_id = auth.uid()) AS viewer_is_host
      FROM public.conversations c
     WHERE auth.uid() IS NOT NULL
       AND (c.renter_id = auth.uid() OR c.host_id = auth.uid())
       AND c.moderation_status <> 'hidden'
  )
  SELECT m.id,
         m.booking_id,
         m.space_id,
         s.title,
         (SELECT sp.storage_path FROM public.space_photos sp
           WHERE sp.space_id = m.space_id
           ORDER BY sp.is_cover DESC, sp.display_order ASC LIMIT 1),
         COALESCE(p.first_name, 'Spacilo member'),
         CASE WHEN m.viewer_is_host THEN 'renter' ELSE 'host' END,
         b.status::text,
         m.last_message_at,
         left(COALESCE((
           SELECT msg.body FROM public.messages msg
            WHERE msg.conversation_id = m.id
            ORDER BY msg.created_at DESC LIMIT 1), ''), 140),
         (SELECT count(*) FROM public.messages msg
           WHERE msg.conversation_id = m.id
             AND msg.sender_id <> auth.uid()
             AND (CASE WHEN m.viewer_is_host THEN m.host_last_read_at ELSE m.renter_last_read_at END IS NULL
                  OR msg.created_at > CASE WHEN m.viewer_is_host THEN m.host_last_read_at ELSE m.renter_last_read_at END)
         )::int,
         (CASE WHEN m.viewer_is_host THEN m.host_archived_at ELSE m.renter_archived_at END) IS NOT NULL,
         m.moderation_status
    FROM mine m
    LEFT JOIN public.spaces s ON s.id = m.space_id
    LEFT JOIN public.bookings b ON b.id = m.booking_id
    LEFT JOIN public.profiles p
           ON p.id = CASE WHEN m.viewer_is_host THEN m.renter_id ELSE m.host_id END
   WHERE ((CASE WHEN m.viewer_is_host THEN m.host_archived_at ELSE m.renter_archived_at END) IS NOT NULL) = COALESCE(p_archived, false)
   ORDER BY m.last_message_at DESC NULLS LAST, m.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_my_conversations(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_conversations(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.conversations
     SET host_last_read_at = CASE WHEN host_id = auth.uid() THEN now() ELSE host_last_read_at END,
         renter_last_read_at = CASE WHEN renter_id = auth.uid() THEN now() ELSE renter_last_read_at END
   WHERE id = p_conversation_id
     AND (host_id = auth.uid() OR renter_id = auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.set_conversation_archived(p_conversation_id uuid, p_archived boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.conversations
     SET host_archived_at = CASE WHEN host_id = auth.uid() THEN (CASE WHEN p_archived THEN now() ELSE NULL END) ELSE host_archived_at END,
         renter_archived_at = CASE WHEN renter_id = auth.uid() THEN (CASE WHEN p_archived THEN now() ELSE NULL END) ELSE renter_archived_at END
   WHERE id = p_conversation_id
     AND (host_id = auth.uid() OR renter_id = auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.report_conversation(p_conversation_id uuid, p_reason text, p_details text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conversations c
                  WHERE c.id = p_conversation_id
                    AND (c.host_id = auth.uid() OR c.renter_id = auth.uid())) THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.conversation_reports (conversation_id, reporter_id, reason, details)
  VALUES (p_conversation_id, auth.uid(), p_reason, left(COALESCE(p_details, ''), 2000))
  RETURNING id INTO v_id;

  UPDATE public.conversations SET moderation_status = 'under_review'
   WHERE id = p_conversation_id AND moderation_status = 'visible';

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.moderate_conversation(p_conversation_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_support_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('visible','under_review','hidden') THEN
    RAISE EXCEPTION 'Unknown moderation status' USING ERRCODE = '22023';
  END IF;
  UPDATE public.conversations SET moderation_status = p_status WHERE id = p_conversation_id;
  UPDATE public.conversation_reports SET status = CASE WHEN p_status = 'hidden' THEN 'actioned' ELSE 'dismissed' END
   WHERE conversation_id = p_conversation_id AND status = 'open';
END $$;

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_conversation_archived(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_conversation(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.moderate_conversation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_conversation_archived(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_conversation(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_conversation(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_host_profile(p_space_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'first_name', COALESCE(p.first_name, 'Your host'),
    'photo_url', p.profile_photo_url,
    'joined_at', p.created_at,
    'phone_verified', COALESCE(p.phone_verified, false),
    'listings_count', (SELECT count(*) FROM public.spaces s2
                        WHERE s2.host_id = s.host_id AND s2.listing_status = 'published'),
    'reputation', public.get_host_reputation(s.host_id),
    'response_stats', public.get_host_response_stats(s.host_id)
  )
  FROM public.spaces s
  LEFT JOIN public.profiles p ON p.id = s.host_id
  WHERE s.id = p_space_id AND s.listing_status = 'published';
$$;

REVOKE ALL ON FUNCTION public.get_public_host_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_host_profile(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_space_unavailable_dates(p_space_id uuid)
RETURNS TABLE (start_date date, end_date date, reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT b.start_date, b.end_date, 'booked'::text
    FROM public.bookings b
    JOIN public.spaces s ON s.id = b.space_id
   WHERE b.space_id = p_space_id
     AND s.listing_status = 'published'
     AND b.status IN ('confirmed','active')
     AND b.end_date >= current_date
  UNION ALL
  SELECT current_date, (s.available_from - 1), 'not_yet_available'::text
    FROM public.spaces s
   WHERE s.id = p_space_id AND s.listing_status = 'published'
     AND s.available_from IS NOT NULL AND s.available_from > current_date
  UNION ALL
  SELECT (s.available_until + 1), (s.available_until + 365), 'after_availability'::text
    FROM public.spaces s
   WHERE s.id = p_space_id AND s.listing_status = 'published'
     AND s.available_until IS NOT NULL
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.get_space_unavailable_dates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_space_unavailable_dates(uuid) TO anon, authenticated;
