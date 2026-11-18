-- Allow all media types that NEXORA AI DRAMA actually stores in this bucket.
-- Videos, generated JPEG posters, and WebVTT subtitles share this bucket.
-- Keep the existing 500 MB limit and owner-only write policies unchanged.

update storage.buckets
set allowed_mime_types = array[
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'image/jpeg',
  'text/vtt'
]
where id = 'nexora-drama-videos';

-- Fail visibly if the expected bucket is missing rather than silently succeeding.
do $$
begin
  if not exists (
    select 1 from storage.buckets where id = 'nexora-drama-videos'
  ) then
    raise exception 'Supabase Storage bucket nexora-drama-videos does not exist';
  end if;
end;
$$;
