-- Active-conversation subscribers refresh only the affected message's reactions.
begin;
create function chat_private.notify_reaction() returns trigger
language plpgsql security definer set search_path='' as $$
declare target_message uuid; target_conversation uuid;
begin
 if tg_op='DELETE' then target_message:=old.message_id;
 else target_message:=new.message_id; end if;
 select conversation_id into target_conversation from public.messages where id=target_message;
 -- Cascading message deletion may already have removed the parent; no refresh is needed then.
 if target_conversation is not null then
  perform realtime.send(jsonb_build_object('message_id',target_message),
   'reaction_changed','conversation:'||target_conversation::text,true);
 end if;
 return null;
end $$;
revoke all on function chat_private.notify_reaction() from public,anon,authenticated;
create trigger notify_reaction after insert or delete on public.message_reactions
for each row execute function chat_private.notify_reaction();
commit;
