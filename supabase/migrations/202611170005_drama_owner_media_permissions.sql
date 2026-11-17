-- NEXORA AI DRAMA: allow owner dashboard poster/subtitle media and thumbnail repair.
-- Apply after 202611170004_drama_series_episodes.sql.

-- The owner dashboard creates JPEG posters and WebVTT subtitle files in this bucket.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'image/jpeg',
  'text/vtt'
]
WHERE id = 'nexora-drama-videos';

-- Thumbnail repair updates poster metadata on an existing drama row.
DROP POLICY IF EXISTS "Owners can update dramas" ON public.dramas;
CREATE POLICY "Owners can update dramas"
ON public.dramas
FOR UPDATE
TO authenticated
USING (public.is_nexora_owner())
WITH CHECK (public.is_nexora_owner());

GRANT UPDATE ON public.dramas TO authenticated;
