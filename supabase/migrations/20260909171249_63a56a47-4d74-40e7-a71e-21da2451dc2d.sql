ALTER TABLE public.marketing_platform_tokens ADD COLUMN IF NOT EXISTS page_token_cipher text;
ALTER TABLE public.marketing_platform_connections ADD COLUMN IF NOT EXISTS linked_page_id text;
ALTER TABLE public.marketing_platform_connections ADD COLUMN IF NOT EXISTS last_published_at timestamptz;