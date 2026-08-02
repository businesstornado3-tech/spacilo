-- ============ ENUMS ============
CREATE TYPE public.space_type AS ENUM ('garage','spare_room','loft','shed','basement','storage_room','outbuilding','commercial','other');
CREATE TYPE public.listing_status AS ENUM ('draft','published','paused','archived');
CREATE TYPE public.storage_mode AS ENUM ('whole','partial');
CREATE TYPE public.space_access_type AS ENUM ('by_arrangement','host_present','daytime','independent','anytime');
CREATE TYPE public.space_access_frequency AS ENUM ('occasional','monthly','few_times_month','weekly','flexible');
CREATE TYPE public.tri_state AS ENUM ('yes','no','not_applicable');
CREATE TYPE public.temperature_condition AS ENUM ('normal_indoor','unheated','unknown');
CREATE TYPE public.moisture_condition AS ENUM ('dry','some_humidity','unknown');

-- ============ SPACES ============
CREATE TABLE public.spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,

  title text NOT NULL DEFAULT '',
  space_type public.space_type,
  description text NOT NULL DEFAULT '',
  listing_status public.listing_status NOT NULL DEFAULT 'draft',

  storage_mode public.storage_mode,
  host_available_percentage integer,

  length_m numeric(6,2),
  width_m numeric(6,2),
  height_m numeric(6,2),
  dimensions_unknown boolean NOT NULL DEFAULT false,
  floor_area_m2 numeric(10,2),
  total_volume_m3 numeric(10,2),
  estimated_available_volume_m3 numeric(10,2),
  reserved_volume_m3 numeric(10,2) NOT NULL DEFAULT 0,
  occupied_volume_m3 numeric(10,2) NOT NULL DEFAULT 0,

  -- private address (never exposed publicly)
  address_line1 text,
  address_line2 text,
  town text,
  postcode text,
  -- public-safe location
  postcode_district text,
  approximate_area text,
  latitude numeric(9,6),
  longitude numeric(9,6),

  monthly_price_pence integer,
  currency text NOT NULL DEFAULT 'GBP',
  minimum_storage_period_months integer NOT NULL DEFAULT 1,

  access_type public.space_access_type,
  access_notes text,
  access_frequency public.space_access_frequency,

  ground_floor_access boolean,
  stairs_required boolean,
  lift_available public.tri_state,
  vehicle_access_close boolean,
  door_width_cm numeric(6,1),
  door_height_cm numeric(6,1),

  features text[] NOT NULL DEFAULT '{}',
  accepted_categories text[] NOT NULL DEFAULT '{}',
  host_restrictions text[] NOT NULL DEFAULT '{}',
  restriction_notes text,

  temperature_condition public.temperature_condition NOT NULL DEFAULT 'unknown',
  moisture_condition public.moisture_condition NOT NULL DEFAULT 'unknown',

  -- reserved for future SpaceFit AI spatial representation
  spatial_model jsonb,

  onboarding_step smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,

  CONSTRAINT spaces_title_len CHECK (char_length(title) <= 120),
  CONSTRAINT spaces_description_len CHECK (char_length(description) <= 2000),
  CONSTRAINT spaces_access_notes_len CHECK (access_notes IS NULL OR char_length(access_notes) <= 500),
  CONSTRAINT spaces_restriction_notes_len CHECK (restriction_notes IS NULL OR char_length(restriction_notes) <= 500),
  CONSTRAINT spaces_price_nonneg CHECK (monthly_price_pence IS NULL OR monthly_price_pence >= 0),
  CONSTRAINT spaces_price_max CHECK (monthly_price_pence IS NULL OR monthly_price_pence <= 10000000),
  CONSTRAINT spaces_len_nonneg CHECK (length_m IS NULL OR length_m >= 0),
  CONSTRAINT spaces_wid_nonneg CHECK (width_m IS NULL OR width_m >= 0),
  CONSTRAINT spaces_hgt_nonneg CHECK (height_m IS NULL OR height_m >= 0),
  CONSTRAINT spaces_door_w_nonneg CHECK (door_width_cm IS NULL OR door_width_cm >= 0),
  CONSTRAINT spaces_door_h_nonneg CHECK (door_height_cm IS NULL OR door_height_cm >= 0),
  CONSTRAINT spaces_pct_range CHECK (host_available_percentage IS NULL OR (host_available_percentage BETWEEN 1 AND 100)),
  CONSTRAINT spaces_reserved_nonneg CHECK (reserved_volume_m3 >= 0),
  CONSTRAINT spaces_occupied_nonneg CHECK (occupied_volume_m3 >= 0),
  CONSTRAINT spaces_min_period CHECK (minimum_storage_period_months BETWEEN 1 AND 60)
);

CREATE INDEX spaces_host_id_idx ON public.spaces(host_id);
CREATE INDEX spaces_status_idx ON public.spaces(listing_status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.spaces TO authenticated;
GRANT ALL ON public.spaces TO service_role;

ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts can create their own spaces"
  ON public.spaces FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can view their own spaces"
  ON public.spaces FOR SELECT TO authenticated
  USING (auth.uid() = host_id);

CREATE POLICY "Hosts can update their own spaces"
  ON public.spaces FOR UPDATE TO authenticated
  USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can delete their own draft spaces"
  ON public.spaces FOR DELETE TO authenticated
  USING (auth.uid() = host_id AND listing_status = 'draft');

-- ============ SPACE PHOTOS ============
CREATE TABLE public.space_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  alt text,
  display_order integer NOT NULL DEFAULT 0,
  is_cover boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX space_photos_space_id_idx ON public.space_photos(space_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.space_photos TO authenticated;
GRANT ALL ON public.space_photos TO service_role;

ALTER TABLE public.space_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts manage photos of their own spaces"
  ON public.space_photos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = space_id AND s.host_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = space_id AND s.host_id = auth.uid()));

-- ============ DERIVED CAPACITY + TIMESTAMPS ============
CREATE OR REPLACE FUNCTION public.spaces_derive_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();

  IF NEW.dimensions_unknown THEN
    NEW.floor_area_m2 := NULL;
    NEW.total_volume_m3 := NULL;
    NEW.estimated_available_volume_m3 := NULL;
  ELSE
    IF NEW.length_m IS NOT NULL AND NEW.width_m IS NOT NULL THEN
      NEW.floor_area_m2 := round(NEW.length_m * NEW.width_m, 2);
    ELSE
      NEW.floor_area_m2 := NULL;
    END IF;

    IF NEW.floor_area_m2 IS NOT NULL AND NEW.height_m IS NOT NULL THEN
      NEW.total_volume_m3 := round(NEW.floor_area_m2 * NEW.height_m, 2);
    ELSE
      NEW.total_volume_m3 := NULL;
    END IF;

    IF NEW.total_volume_m3 IS NOT NULL THEN
      NEW.estimated_available_volume_m3 := round(
        NEW.total_volume_m3 * (COALESCE(
          CASE WHEN NEW.storage_mode = 'partial' THEN NEW.host_available_percentage ELSE 100 END, 100
        )::numeric / 100), 2);
    ELSE
      NEW.estimated_available_volume_m3 := NULL;
    END IF;
  END IF;

  -- derive the public postcode district from the private postcode
  IF NEW.postcode IS NOT NULL AND length(regexp_replace(NEW.postcode, '\s', '', 'g')) >= 5 THEN
    NEW.postcode_district := upper(substring(regexp_replace(NEW.postcode, '\s', '', 'g')
      from 1 for length(regexp_replace(NEW.postcode, '\s', '', 'g')) - 3));
  END IF;

  IF NEW.listing_status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER spaces_derive_fields_trg
BEFORE INSERT OR UPDATE ON public.spaces
FOR EACH ROW EXECUTE FUNCTION public.spaces_derive_fields();

CREATE TRIGGER space_photos_updated_at
BEFORE UPDATE ON public.space_photos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PUBLISH VALIDATION (server-side, not client-trusted) ============
CREATE OR REPLACE FUNCTION public.spaces_validate_publish()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.listing_status IN ('published','paused') THEN
    IF NEW.space_type IS NULL THEN RAISE EXCEPTION 'A space type is required before publishing.'; END IF;
    IF btrim(NEW.title) = '' THEN RAISE EXCEPTION 'A title is required before publishing.'; END IF;
    IF NEW.postcode IS NULL OR btrim(NEW.postcode) = '' THEN RAISE EXCEPTION 'A postcode is required before publishing.'; END IF;
    IF btrim(NEW.description) = '' THEN RAISE EXCEPTION 'A description is required before publishing.'; END IF;
    IF NEW.storage_mode IS NULL THEN RAISE EXCEPTION 'Choose whole or part of the space before publishing.'; END IF;
    IF NEW.monthly_price_pence IS NULL OR NEW.monthly_price_pence <= 0 THEN RAISE EXCEPTION 'A monthly price is required before publishing.'; END IF;
    IF NEW.access_type IS NULL THEN RAISE EXCEPTION 'Access information is required before publishing.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.space_photos p WHERE p.space_id = NEW.id) THEN
      RAISE EXCEPTION 'At least one photo is required before publishing.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER spaces_validate_publish_trg
BEFORE INSERT OR UPDATE ON public.spaces
FOR EACH ROW EXECUTE FUNCTION public.spaces_validate_publish();

-- ============ PUBLIC READ SURFACE (safe columns only) ============
CREATE OR REPLACE FUNCTION public.get_published_spaces(limit_count integer DEFAULT 60)
RETURNS TABLE (
  id uuid, title text, space_type public.space_type, description text,
  storage_mode public.storage_mode, host_available_percentage integer,
  floor_area_m2 numeric, total_volume_m3 numeric, estimated_available_volume_m3 numeric,
  postcode_district text, approximate_area text, latitude numeric, longitude numeric,
  monthly_price_pence integer, currency text, minimum_storage_period_months integer,
  access_type public.space_access_type, access_frequency public.space_access_frequency,
  features text[], accepted_categories text[],
  cover_path text, published_at timestamptz,
  host_display_name text, host_phone_verified boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.title, s.space_type, s.description,
         s.storage_mode, s.host_available_percentage,
         s.floor_area_m2, s.total_volume_m3, s.estimated_available_volume_m3,
         s.postcode_district, s.approximate_area, s.latitude, s.longitude,
         s.monthly_price_pence, s.currency, s.minimum_storage_period_months,
         s.access_type, s.access_frequency,
         s.features, s.accepted_categories,
         (SELECT p.storage_path FROM public.space_photos p WHERE p.space_id = s.id
           ORDER BY p.is_cover DESC, p.display_order ASC LIMIT 1),
         s.published_at,
         COALESCE(NULLIF(btrim(pr.display_name), ''), NULLIF(btrim(pr.first_name), ''), 'Host'),
         COALESCE(pr.phone_verified, false)
  FROM public.spaces s
  LEFT JOIN public.profiles pr ON pr.id = s.host_id
  WHERE s.listing_status = 'published'
  ORDER BY s.published_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(limit_count, 60), 1), 200);
$$;

CREATE OR REPLACE FUNCTION public.get_published_space(space_id uuid)
RETURNS TABLE (
  id uuid, title text, space_type public.space_type, description text,
  storage_mode public.storage_mode, host_available_percentage integer,
  length_m numeric, width_m numeric, height_m numeric,
  floor_area_m2 numeric, total_volume_m3 numeric, estimated_available_volume_m3 numeric,
  postcode_district text, approximate_area text,
  monthly_price_pence integer, currency text, minimum_storage_period_months integer,
  access_type public.space_access_type, access_notes text, access_frequency public.space_access_frequency,
  ground_floor_access boolean, stairs_required boolean, lift_available public.tri_state,
  vehicle_access_close boolean, door_width_cm numeric, door_height_cm numeric,
  features text[], accepted_categories text[], host_restrictions text[], restriction_notes text,
  temperature_condition public.temperature_condition, moisture_condition public.moisture_condition,
  photo_paths text[], published_at timestamptz,
  host_display_name text, host_phone_verified boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.title, s.space_type, s.description,
         s.storage_mode, s.host_available_percentage,
         s.length_m, s.width_m, s.height_m,
         s.floor_area_m2, s.total_volume_m3, s.estimated_available_volume_m3,
         s.postcode_district, s.approximate_area,
         s.monthly_price_pence, s.currency, s.minimum_storage_period_months,
         s.access_type, s.access_notes, s.access_frequency,
         s.ground_floor_access, s.stairs_required, s.lift_available,
         s.vehicle_access_close, s.door_width_cm, s.door_height_cm,
         s.features, s.accepted_categories, s.host_restrictions, s.restriction_notes,
         s.temperature_condition, s.moisture_condition,
         COALESCE((SELECT array_agg(p.storage_path ORDER BY p.is_cover DESC, p.display_order ASC)
                   FROM public.space_photos p WHERE p.space_id = s.id), '{}'),
         s.published_at,
         COALESCE(NULLIF(btrim(pr.display_name), ''), NULLIF(btrim(pr.first_name), ''), 'Host'),
         COALESCE(pr.phone_verified, false)
  FROM public.spaces s
  LEFT JOIN public.profiles pr ON pr.id = s.host_id
  WHERE s.id = space_id AND s.listing_status = 'published';
$$;

GRANT EXECUTE ON FUNCTION public.get_published_spaces(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_published_space(uuid) TO anon, authenticated;