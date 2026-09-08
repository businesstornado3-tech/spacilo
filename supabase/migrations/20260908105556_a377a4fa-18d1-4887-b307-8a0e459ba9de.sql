CREATE TABLE IF NOT EXISTS public.marketing_platform_tokens (
  platform text PRIMARY KEY,
  access_token_cipher text NOT NULL,
  refresh_token_cipher text,
  scopes text[] NOT NULL DEFAULT '{}',
  account_id text,
  expires_at timestamptz,
  obtained_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.marketing_platform_tokens TO service_role;

ALTER TABLE public.marketing_platform_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.marketing_oauth_states (
  state text PRIMARY KEY,
  platform text NOT NULL,
  created_by uuid NOT NULL,
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.marketing_oauth_states TO service_role;

ALTER TABLE public.marketing_oauth_states ENABLE ROW LEVEL SECURITY;