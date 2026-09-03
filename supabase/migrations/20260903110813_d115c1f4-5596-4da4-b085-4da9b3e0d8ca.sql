ALTER TABLE public.growth_audit_events ADD COLUMN event_key text;
UPDATE public.growth_audit_events SET event_key = id::text WHERE event_key IS NULL;
ALTER TABLE public.growth_audit_events ALTER COLUMN event_key SET NOT NULL;
CREATE UNIQUE INDEX growth_audit_events_event_key_key ON public.growth_audit_events (event_key);