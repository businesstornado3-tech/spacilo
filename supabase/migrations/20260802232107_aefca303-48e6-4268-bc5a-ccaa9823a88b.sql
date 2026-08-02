ALTER TABLE public.inventory_detections
  ADD COLUMN IF NOT EXISTS object_confidence text,
  ADD COLUMN IF NOT EXISTS quantity_confidence text,
  ADD COLUMN IF NOT EXISTS min_plausible_quantity integer,
  ADD COLUMN IF NOT EXISTS max_plausible_quantity integer,
  ADD COLUMN IF NOT EXISTS inventory_intent text NOT NULL DEFAULT 'likely_inventory';

ALTER TABLE public.inventory_detections
  DROP CONSTRAINT IF EXISTS inventory_detections_object_confidence_check,
  DROP CONSTRAINT IF EXISTS inventory_detections_quantity_confidence_check,
  DROP CONSTRAINT IF EXISTS inventory_detections_inventory_intent_check,
  DROP CONSTRAINT IF EXISTS inventory_detections_quantity_range_check;

ALTER TABLE public.inventory_detections
  ADD CONSTRAINT inventory_detections_object_confidence_check
    CHECK (object_confidence IS NULL OR object_confidence IN ('high','medium','low')),
  ADD CONSTRAINT inventory_detections_quantity_confidence_check
    CHECK (quantity_confidence IS NULL OR quantity_confidence IN ('high','medium','low')),
  ADD CONSTRAINT inventory_detections_inventory_intent_check
    CHECK (inventory_intent IN ('likely_inventory','uncertain_inventory','likely_environment')),
  ADD CONSTRAINT inventory_detections_quantity_range_check
    CHECK (
      (min_plausible_quantity IS NULL OR min_plausible_quantity >= 0)
      AND (max_plausible_quantity IS NULL OR max_plausible_quantity >= 0)
      AND (min_plausible_quantity IS NULL OR max_plausible_quantity IS NULL OR min_plausible_quantity <= max_plausible_quantity)
    );

CREATE INDEX IF NOT EXISTS inventory_detections_intent_idx
  ON public.inventory_detections (inventory_id, inventory_intent, review_status);