-- Atomic settings update; role is a display label, never an authorization role.
begin;
alter table public.profiles add constraint profiles_avatar_format check(avatar_url='' or avatar_url ~ '^https://[^[:space:]]+$' or avatar_url ~ ('^avatar:'||id::text||'/[0-9a-f-]{36}$'));
create function public.update_my_settings(settings jsonb) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); k text; begin
 if settings is null or jsonb_typeof(settings)<>'object' then raise exception 'Settings must be an object'; end if;
 for k in select jsonb_object_keys(settings) loop
 if k not in ('theme','density','enterToSend','desktopNotifications','soundNotifications','displayName','statusMessage','avatar','presence','role') then raise exception 'Unknown settings field: %',k; end if;
 if jsonb_typeof(settings->k)<>(case when k in ('enterToSend','desktopNotifications','soundNotifications') then 'boolean' else 'string' end) then raise exception 'Invalid settings field: %',k; end if; end loop;
 update public.profiles set display_name=coalesce(settings->>'displayName',display_name),status_message=coalesce(settings->>'statusMessage',status_message),avatar_url=coalesce(settings->>'avatar',avatar_url),presence=coalesce(settings->>'presence',presence),role=coalesce(settings->>'role',role) where id=u;
 update public.user_settings set theme=coalesce(settings->>'theme',theme),density=coalesce(settings->>'density',density),enter_to_send=coalesce((settings->>'enterToSend')::boolean,enter_to_send),desktop_notifications=coalesce((settings->>'desktopNotifications')::boolean,desktop_notifications),sound_notifications=coalesce((settings->>'soundNotifications')::boolean,sound_notifications) where user_id=u;
end $$;
revoke all on function public.update_my_settings(jsonb) from public,anon,authenticated;
grant execute on function public.update_my_settings(jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('profile-avatars','profile-avatars',false,2097152,array['image/png','image/jpeg','image/webp','image/gif']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy avatar_read on storage.objects for select to authenticated using(bucket_id='profile-avatars' and auth.uid() is not null);
create policy avatar_upload on storage.objects for insert to authenticated with check(bucket_id='profile-avatars' and name ~ ('^'||auth.uid()::text||'/[0-9a-f-]{36}$') and (metadata is null or ((metadata->>'size')::bigint between 1 and 2097152 and metadata->>'mimetype' in ('image/png','image/jpeg','image/webp','image/gif'))));
create policy avatar_delete on storage.objects for delete to authenticated using(bucket_id='profile-avatars' and split_part(name,'/',1)=auth.uid()::text);
commit;
