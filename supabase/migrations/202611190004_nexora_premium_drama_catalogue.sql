-- NEXORA AI DRAMA: premium catalogue enforcement.
-- Premium episodes must live in the private bucket and may only be played through
-- the premium-video-url Edge Function after a server-side entitlement check.
ALTER TABLE public.dramas
  ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS premium_video_storage_path text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dramas_premium_media_private'
      AND conrelid = 'public.dramas'::regclass
  ) THEN
    ALTER TABLE public.dramas
      ADD CONSTRAINT dramas_premium_media_private CHECK (
        NOT is_premium OR (
          premium_video_storage_path IS NOT NULL
          AND length(trim(premium_video_storage_path)) > 0
          AND video_storage_path IS NULL
          AND video_url IS NULL
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS dramas_premium_published_idx
  ON public.dramas (is_premium, published)
  WHERE is_premium = true;

COMMENT ON COLUMN public.dramas.is_premium IS
  'When true, the episode is excluded from public video URLs and must be served through the premium entitlement Edge Function.';
COMMENT ON COLUMN public.dramas.premium_video_storage_path IS
  'Object path in the private nexora-premium-videos bucket; never expose a public URL.';
