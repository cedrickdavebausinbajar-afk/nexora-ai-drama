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

-- Use a POST RPC for poster metadata updates so Android HttpURLConnection
-- does not need the non-standard PATCH method.
CREATE OR REPLACE FUNCTION public.update_drama_poster(
  p_drama_id uuid,
  p_poster_url text,
  p_poster_storage_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_nexora_owner() THEN
    RAISE EXCEPTION 'NEXORA owner access required';
  END IF;

  UPDATE public.dramas
  SET poster_url = p_poster_url,
      poster_storage_path = p_poster_storage_path
  WHERE id = p_drama_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_drama_poster(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.update_drama_poster(uuid, text, text) TO authenticated;
