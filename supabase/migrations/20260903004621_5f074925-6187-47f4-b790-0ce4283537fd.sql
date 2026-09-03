ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS vat_rate_percent integer,
  ADD COLUMN IF NOT EXISTS vat_amount_pence integer NOT NULL DEFAULT 0 CHECK (vat_amount_pence >= 0),
  ADD COLUMN IF NOT EXISTS vat_policy_status text NOT NULL DEFAULT 'pending_adviser_confirmation';

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS vat_rate_percent integer,
  ADD COLUMN IF NOT EXISTS vat_amount_pence integer NOT NULL DEFAULT 0 CHECK (vat_amount_pence >= 0),
  ADD COLUMN IF NOT EXISTS vat_policy_status text NOT NULL DEFAULT 'pending_adviser_confirmation';