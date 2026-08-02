-- new photo states
ALTER TYPE public.inventory_photo_status ADD VALUE IF NOT EXISTS 'queued';
ALTER TYPE public.inventory_photo_status ADD VALUE IF NOT EXISTS 'analysing';

CREATE TYPE public.analysis_run_status AS ENUM ('queued','running','completed','partial','failed');
CREATE TYPE public.detection_review_status AS ENUM ('pending','confirmed','edited','rejected');

CREATE TABLE public.inventory_analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES public.renter_inventories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  client_request_id text,
  provider text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL DEFAULT 'v1',
  schema_version text NOT NULL DEFAULT 'v1',
  status public.analysis_run_status NOT NULL DEFAULT 'queued',
  photo_count integer NOT NULL DEFAULT 0,
  analysed_photo_count integer NOT NULL DEFAULT 0,
  failed_photo_count integer NOT NULL DEFAULT 0,
  detection_count integer NOT NULL DEFAULT 0,
  duration_ms integer,
  error_category text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX inventory_analysis_runs_request_key
  ON public.inventory_analysis_runs (inventory_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
CREATE INDEX inventory_analysis_runs_inventory_idx ON public.inventory_analysis_runs (inventory_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_analysis_runs TO authenticated;
GRANT ALL ON public.inventory_analysis_runs TO service_role;
ALTER TABLE public.inventory_analysis_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Renters manage their own analysis runs"
  ON public.inventory_analysis_runs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER inventory_analysis_runs_updated_at
  BEFORE UPDATE ON public.inventory_analysis_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.inventory_detections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.inventory_analysis_runs(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.renter_inventories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  detected_label text NOT NULL,
  suggested_category public.inventory_item_category NOT NULL DEFAULT 'other',
  suggested_catalogue_key text,
  suggested_quantity integer NOT NULL DEFAULT 1 CHECK (suggested_quantity BETWEEN 1 AND 999),
  confirmed_quantity integer CHECK (confirmed_quantity BETWEEN 1 AND 999),
  confidence_score numeric(4,3) CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  stackable_suggestion public.item_tri_state NOT NULL DEFAULT 'unknown',
  fragile_suggestion public.item_tri_state NOT NULL DEFAULT 'unknown',
  orientation_suggestion public.item_tri_state NOT NULL DEFAULT 'unknown',
  possible_duplicate_group text,
  duplicate_certainty text,
  possible_restricted_item boolean NOT NULL DEFAULT false,
  restricted_reason text,
  notes text,
  review_status public.detection_review_status NOT NULL DEFAULT 'pending',
  resulting_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_detections_run_idx ON public.inventory_detections (run_id);
CREATE INDEX inventory_detections_inventory_idx ON public.inventory_detections (inventory_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_detections TO authenticated;
GRANT ALL ON public.inventory_detections TO service_role;
ALTER TABLE public.inventory_detections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Renters manage their own detections"
  ON public.inventory_detections FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER inventory_detections_updated_at
  BEFORE UPDATE ON public.inventory_detections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.inventory_detection_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id uuid NOT NULL REFERENCES public.inventory_detections(id) ON DELETE CASCADE,
  photo_id uuid NOT NULL REFERENCES public.inventory_photos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (detection_id, photo_id)
);
CREATE INDEX inventory_detection_photos_photo_idx ON public.inventory_detection_photos (photo_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_detection_photos TO authenticated;
GRANT ALL ON public.inventory_detection_photos TO service_role;
ALTER TABLE public.inventory_detection_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Renters manage their own detection photo links"
  ON public.inventory_detection_photos FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.inventory_photos
  ADD COLUMN IF NOT EXISTS last_run_id uuid REFERENCES public.inventory_analysis_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_error_category text,
  ADD COLUMN IF NOT EXISTS analysed_at timestamptz;