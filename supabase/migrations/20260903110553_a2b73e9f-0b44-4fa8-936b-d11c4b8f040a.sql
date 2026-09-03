REVOKE ALL ON FUNCTION public.growth_touch_updated_at() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_growth_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'growth audit events are append-only' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_growth_audit_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_growth_audit_mutation() TO service_role;

CREATE TRIGGER growth_audit_events_immutable
BEFORE UPDATE OR DELETE ON public.growth_audit_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_growth_audit_mutation();

REVOKE INSERT ON public.growth_learning_signals FROM authenticated;