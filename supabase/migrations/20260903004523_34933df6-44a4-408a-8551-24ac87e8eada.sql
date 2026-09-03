CREATE OR REPLACE FUNCTION public.stow_payout_release_delay_hours()
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT 168;
$$;

CREATE OR REPLACE FUNCTION public.stow_payout_eligible_at(p_start_date date)
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (p_start_date::timestamp AT TIME ZONE 'UTC')
       + make_interval(hours => public.stow_payout_release_delay_hours());
$$;