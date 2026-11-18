-- Align NEXORA AI DRAMA storage with the buckets used by NEXORA ADMIN.
-- Apply this migration to the NEXORA AI DRAMA Supabase project.
-- Public reads support playback; only approved NEXORA owners may write.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('nexora-drama-videos', 'nexora-drama-videos', true, 1073741824,
   array['video/mp4', 'video/webm', 'video/quicktime']),
  ('nexora-drama-posters', 'nexora-drama-posters', true, 10485760,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('nexora-drama-subtitles', 'nexora-drama-subtitles', true, 1048576,
   array['text/vtt'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists nexora_drama_assets_public_read on storage.objects;
create policy nexora_drama_assets_public_read
on storage.objects for select to anon, authenticated
using (bucket_id in ('nexora-drama-videos', 'nexora-drama-posters', 'nexora-drama-subtitles'));

drop policy if exists nexora_drama_assets_owner_insert on storage.objects;
create policy nexora_drama_assets_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id in ('nexora-drama-videos', 'nexora-drama-posters', 'nexora-drama-subtitles')
  and public.is_nexora_owner()
);

drop policy if exists nexora_drama_assets_owner_update on storage.objects;
create policy nexora_drama_assets_owner_update
on storage.objects for update to authenticated
using (
  bucket_id in ('nexora-drama-videos', 'nexora-drama-posters', 'nexora-drama-subtitles')
  and public.is_nexora_owner()
)
with check (
  bucket_id in ('nexora-drama-videos', 'nexora-drama-posters', 'nexora-drama-subtitles')
  and public.is_nexora_owner()
);

drop policy if exists nexora_drama_assets_owner_delete on storage.objects;
create policy nexora_drama_assets_owner_delete
on storage.objects for delete to authenticated
using (
  bucket_id in ('nexora-drama-videos', 'nexora-drama-posters', 'nexora-drama-subtitles')
  and public.is_nexora_owner()
);
