-- Public-read bucket for verification screenshots (before/after images on the
-- Timeline). Only the service role (CI) uploads; it bypasses storage RLS.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification-screenshots', 'verification-screenshots', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
