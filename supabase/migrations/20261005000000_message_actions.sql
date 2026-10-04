-- Migration: Message soft-delete and edit actions
create or replace function public.delete_message(target_message uuid) returns void language plpgsql security definer set search_path='' as $$
declare
  u uuid := chat_private.uid();
  m public.messages;
begin
  select * into m from public.messages where id = target_message for update;
  if not found then
    raise exception 'Message unavailable';
  end if;
  if m.sender_id <> u then
    raise exception 'Only the sender can delete their message';
  end if;
  update public.messages
  set deleted_at = clock_timestamp(),
      content = 'Message deleted',
      updated_at = clock_timestamp()
  where id = target_message;
end $$;

create or replace function public.edit_message(target_message uuid, new_content text) returns void language plpgsql security definer set search_path='' as $$
declare
  u uuid := chat_private.uid();
  m public.messages;
begin
  if new_content is null or octet_length(new_content) > 10000 or btrim(new_content) = '' then
    raise exception 'Invalid message content';
  end if;
  select * into m from public.messages where id = target_message for update;
  if not found then
    raise exception 'Message unavailable';
  end if;
  if m.sender_id <> u then
    raise exception 'Only the sender can edit their message';
  end if;
  if m.deleted_at is not null then
    raise exception 'Cannot edit deleted message';
  end if;
  update public.messages
  set content = btrim(new_content),
      updated_at = clock_timestamp()
  where id = target_message;
end $$;

revoke all on function public.delete_message(uuid) from public, anon, authenticated;
grant execute on function public.delete_message(uuid) to authenticated;

revoke all on function public.edit_message(uuid, text) from public, anon, authenticated;
grant execute on function public.edit_message(uuid, text) to authenticated;
