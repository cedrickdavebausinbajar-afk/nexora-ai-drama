-- Dedicated storage for NEXORA drama posters and subtitle files.
-- Keep the video bucket restricted to video MIME types.
-- Existing video objects and their public URLs remain unchanged.

update storage.buckets
set allowed_mime_types = array['video/mp4','video/webm','video/quicktime'],
    file_size_limit = 524288000,
    public = true
where id = 'nexora-drama-videos';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'nexora-drama-assets',
  'nexora-drama-assets',
  true,
  10485760,
  array['image/jpeg','text/vtt']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read NEXORA drama assets" on storage.objects;
create policy "Public can read NEXORA drama assets"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'nexora-drama-assets');

drop policy if exists "NEXORA owners can upload drama assets" on storage.objects;
create policy "NEXORA owners can upload drama assets"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'nexora-drama-assets'
  and public.is_nexora_owner()
);

drop policy if exists "NEXORA owners can update drama assets" on storage.objects;
create policy "NEXORA owners can update drama assets"
on storage.objects for update
to authenticated
using (
  bucket_id = 'nexora-drama-assets'
  and public.is_nexora_owner()
)
with check (
  bucket_id = 'nexora-drama-assets'
  and public.is_nexora_owner()
);

drop policy if exists "NEXORA owners can delete drama assets" on storage.objects;
create policy "NEXORA owners can delete drama assets"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'nexora-drama-assets'
  and public.is_nexora_owner()
);

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'nexora-drama-videos') then
    raise exception 'Required bucket nexora-drama-videos is missing; apply the original video storage migration first';
  end if;
  if not exists (select 1 from storage.buckets where id = 'nexora-drama-assets') then
    raise exception 'Could not create required bucket nexora-drama-assets';
  end if;
end;
$$;
