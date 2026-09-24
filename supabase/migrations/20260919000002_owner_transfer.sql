-- Preserve channel administration when an account is removed by the admin API.
begin;
create function chat_private.transfer_channel_owner() returns trigger language plpgsql security definer set search_path='' as $$
declare c uuid; successor uuid; begin
 for c in select conversation_id from public.conversation_members where user_id=old.id and role='owner' loop
 select user_id into successor from public.conversation_members where conversation_id=c and user_id<>old.id order by case role when 'admin' then 0 else 1 end,joined_at,user_id limit 1;
 if successor is not null then
 update public.conversation_members set role='owner' where conversation_id=c and user_id=successor;
 update public.conversations set created_by=successor where id=c;
 end if;
 end loop; return old; end $$;
revoke all on function chat_private.transfer_channel_owner() from public,anon,authenticated;
create trigger transfer_channel_owner before delete on public.profiles for each row execute function chat_private.transfer_channel_owner();
commit;
