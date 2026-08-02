-- Enums
CREATE TYPE public.inventory_status AS ENUM ('draft','ready','archived');
CREATE TYPE public.inventory_item_category AS ENUM ('boxes','bags','furniture','appliances','electronics','bicycles','sports','student','business','documents','other');
CREATE TYPE public.item_size_source AS ENUM ('catalogue_estimate','user_measured','unknown');
CREATE TYPE public.inventory_photo_status AS ENUM ('uploaded','pending','analysed','failed');
CREATE TYPE public.item_tri_state AS ENUM ('yes','no','unknown');

-- Inventories -------------------------------------------------------------
CREATE TABLE public.renter_inventories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'My Stuff',
  status public.inventory_status NOT NULL DEFAULT 'draft',
  estimated_total_item_volume_m3 numeric(10,3) NOT NULL DEFAULT 0,
  estimated_storage_requirement_m3 numeric(10,3) NOT NULL DEFAULT 0,
  item_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX renter_inventories_user_idx ON public.renter_inventories(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.renter_inventories TO authenticated;
GRANT ALL ON public.renter_inventories TO service_role;
ALTER TABLE public.renter_inventories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their inventories" ON public.renter_inventories
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owners create their inventories" ON public.renter_inventories
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owners update their inventories" ON public.renter_inventories
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owners delete their inventories" ON public.renter_inventories
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Items --------------------------------------------------------------------
CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES public.renter_inventories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  catalogue_key text,
  item_name text NOT NULL,
  category public.inventory_item_category NOT NULL DEFAULT 'other',
  quantity integer NOT NULL DEFAULT 1,
  length_cm numeric(8,1),
  width_cm numeric(8,1),
  height_cm numeric(8,1),
  estimated_unit_volume_m3 numeric(10,4),
  estimated_total_volume_m3 numeric(10,4),
  stackable public.item_tri_state NOT NULL DEFAULT 'unknown',
  fragile boolean NOT NULL DEFAULT false,
  orientation_flexible public.item_tri_state NOT NULL DEFAULT 'unknown',
  size_source public.item_size_source NOT NULL DEFAULT 'catalogue_estimate',
  confidence_score numeric(4,3),
  notes text,
  created_manually boolean NOT NULL DEFAULT true,
  ai_detected boolean NOT NULL DEFAULT false,
  ai_confirmed boolean NOT NULL DEFAULT false,
  source_photo_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_items_quantity_ck CHECK (quantity > 0 AND quantity <= 999),
  CONSTRAINT inventory_items_length_ck CHECK (length_cm IS NULL OR (length_cm > 0 AND length_cm <= 1500)),
  CONSTRAINT inventory_items_width_ck CHECK (width_cm IS NULL OR (width_cm > 0 AND width_cm <= 1500)),
  CONSTRAINT inventory_items_height_ck CHECK (height_cm IS NULL OR (height_cm > 0 AND height_cm <= 1500)),
  CONSTRAINT inventory_items_volume_ck CHECK (estimated_total_volume_m3 IS NULL OR estimated_total_volume_m3 >= 0),
  CONSTRAINT inventory_items_confidence_ck CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);
CREATE INDEX inventory_items_inventory_idx ON public.inventory_items(inventory_id);
CREATE INDEX inventory_items_user_idx ON public.inventory_items(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their items" ON public.inventory_items
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owners create their items" ON public.inventory_items
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.renter_inventories i WHERE i.id = inventory_id AND i.user_id = auth.uid())
  );
CREATE POLICY "Owners update their items" ON public.inventory_items
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owners delete their items" ON public.inventory_items
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Photos -------------------------------------------------------------------
CREATE TABLE public.inventory_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES public.renter_inventories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  storage_path text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  analysis_status public.inventory_photo_status NOT NULL DEFAULT 'uploaded',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_photos_inventory_idx ON public.inventory_photos(inventory_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_photos TO authenticated;
GRANT ALL ON public.inventory_photos TO service_role;
ALTER TABLE public.inventory_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their inventory photos" ON public.inventory_photos
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owners create their inventory photos" ON public.inventory_photos
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.renter_inventories i WHERE i.id = inventory_id AND i.user_id = auth.uid())
  );
CREATE POLICY "Owners update their inventory photos" ON public.inventory_photos
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owners delete their inventory photos" ON public.inventory_photos
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Derivation: per-item volumes ---------------------------------------------
CREATE OR REPLACE FUNCTION public.inventory_items_derive()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.length_cm IS NOT NULL AND NEW.width_cm IS NOT NULL AND NEW.height_cm IS NOT NULL THEN
    NEW.estimated_unit_volume_m3 := round((NEW.length_cm * NEW.width_cm * NEW.height_cm) / 1000000.0, 4);
    NEW.estimated_total_volume_m3 := round(NEW.estimated_unit_volume_m3 * NEW.quantity, 4);
  ELSE
    NEW.estimated_unit_volume_m3 := NULL;
    NEW.estimated_total_volume_m3 := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_items_derive_trg
BEFORE INSERT OR UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.inventory_items_derive();

-- Rollup: inventory totals with a transparent packing allowance -------------
-- Allowance model (MVP, deterministic, no AI):
--   boxes/documents/business (highly stackable)      -> 1.15x
--   bags/electronics/student (mixed household)       -> 1.25x
--   furniture/appliances/bicycles/sports/other       -> 1.40x
-- Applied per item volume, then summed.
CREATE OR REPLACE FUNCTION public.inventory_recalculate(target uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_raw numeric := 0;
  v_req numeric := 0;
  v_count integer := 0;
BEGIN
  SELECT
    COALESCE(SUM(COALESCE(estimated_total_volume_m3, 0)), 0),
    COALESCE(SUM(COALESCE(estimated_total_volume_m3, 0) * CASE
      WHEN category IN ('boxes','documents','business') THEN 1.15
      WHEN category IN ('bags','electronics','student') THEN 1.25
      ELSE 1.40 END), 0),
    COALESCE(SUM(quantity), 0)
  INTO v_raw, v_req, v_count
  FROM public.inventory_items WHERE inventory_id = target;

  UPDATE public.renter_inventories
     SET estimated_total_item_volume_m3 = round(v_raw, 3),
         estimated_storage_requirement_m3 = round(v_req, 3),
         item_count = v_count,
         updated_at = now()
   WHERE id = target;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.inventory_recalculate(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.inventory_items_rollup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.inventory_recalculate(OLD.inventory_id);
    RETURN OLD;
  END IF;
  PERFORM public.inventory_recalculate(NEW.inventory_id);
  IF TG_OP = 'UPDATE' AND OLD.inventory_id <> NEW.inventory_id THEN
    PERFORM public.inventory_recalculate(OLD.inventory_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_items_rollup_trg
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.inventory_items_rollup();

CREATE TRIGGER inventory_photos_updated_at
BEFORE UPDATE ON public.inventory_photos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies for the private inventory-photos bucket ------------------
CREATE POLICY "Owners read their inventory photo files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'inventory-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owners upload their inventory photo files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inventory-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owners update their inventory photo files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'inventory-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owners delete their inventory photo files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'inventory-photos' AND (storage.foldername(name))[1] = auth.uid()::text);