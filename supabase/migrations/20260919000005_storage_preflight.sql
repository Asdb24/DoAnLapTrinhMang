-- Storage performs an authorization preflight with empty metadata before writing bytes.
-- Final size/type remain enforced by bucket limits and send_message's object verification.
begin;
create or replace function chat_private.storage_allowed(path text,meta jsonb,operation text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.attachments a where a.storage_path=path and chat_private.member(a.conversation_id) and case operation
 when 'insert' then a.uploader_id=auth.uid() and a.message_id is null and (meta is null or meta='{}'::jsonb or ((meta->>'size')::bigint=a.file_size and meta->>'mimetype'=a.mime_type))
 when 'select' then (a.message_id is not null and chat_private.visible_message(a.message_id)) or (a.message_id is null and a.uploader_id=auth.uid())
 when 'delete' then a.uploader_id=auth.uid() and a.message_id is null else false end) $$;
drop policy avatar_upload on storage.objects;
create policy avatar_upload on storage.objects for insert to authenticated with check(bucket_id='profile-avatars' and name ~ ('^'||auth.uid()::text||'/[0-9a-f-]{36}$') and (metadata is null or metadata='{}'::jsonb or ((metadata->>'size')::bigint between 1 and 2097152 and metadata->>'mimetype' in ('image/png','image/jpeg','image/webp','image/gif'))));
commit;
