ALTER TABLE public.growth_insights ADD COLUMN insight_key text;
UPDATE public.growth_insights SET insight_key = id::text WHERE insight_key IS NULL;
ALTER TABLE public.growth_insights ALTER COLUMN insight_key SET NOT NULL;
CREATE UNIQUE INDEX growth_insights_insight_key_key ON public.growth_insights (insight_key);