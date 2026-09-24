-- Per-actor rolling windows bound persistent rows and broadcast fan-out.
-- Existing conversations/memberships/reactions return without writes or quota use.
begin;
create or replace function public.get_or_create_direct_conversation(other_user_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); k text; c uuid;
begin
 if other_user_id=u or not exists(select 1 from public.profiles where id=other_user_id) then raise exception 'Contact unavailable'; end if;
 if exists(select 1 from public.blocked_users where (user_id=u and blocked_id=other_user_id) or (user_id=other_user_id and blocked_id=u)) then raise exception 'Contact unavailable'; end if;
 k:=least(u::text,other_user_id::text)||':'||greatest(u::text,other_user_id::text);
 perform pg_advisory_xact_lock(hashtextextended(k,2));
 select id into c from public.conversations where direct_key=k;
 if found then return c; end if;
 perform chat_private.rate('direct_conversation',20,60);
 insert into public.conversations(type,title,created_by,direct_key) values('direct','Direct message',u,k) returning id into c;
 insert into public.conversation_members(conversation_id,user_id) values(c,u),(c,other_user_id);
 return c;
end $$;
create or replace function public.invite_channel_member(target_conversation uuid,target_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=chat_private.uid();
begin
 if not exists(select 1 from public.conversation_members m join public.conversations c on c.id=m.conversation_id where c.id=target_conversation and c.type='group' and m.user_id=u and m.role in ('owner','admin')) then raise exception 'Channel unavailable'; end if;
 if not exists(select 1 from public.profiles where id=target_user) then raise exception 'Contact unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_conversation::text||target_user::text,3));
 if exists(select 1 from public.conversation_members where conversation_id=target_conversation and user_id=target_user) then return; end if;
 perform chat_private.rate('invitation',30,60);
 insert into public.conversation_members(conversation_id,user_id) values(target_conversation,target_user) on conflict do nothing;
end $$;
create or replace function public.set_reaction(target_message uuid,reaction_emoji text,active boolean) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); present boolean;
begin
 if not chat_private.visible_message(target_message) then raise exception 'Message unavailable'; end if;
 if active is null or reaction_emoji is null or char_length(reaction_emoji) not between 1 and 32 or reaction_emoji ~ '[[:cntrl:]]' then raise exception 'Invalid reaction'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||target_message::text,4));
 select exists(select 1 from public.message_reactions where message_id=target_message and user_id=u and emoji=reaction_emoji) into present;
 if present=active then return; end if;
 perform chat_private.rate('reaction',60,60);
 if active then insert into public.message_reactions(message_id,user_id,emoji) values(target_message,u,reaction_emoji) on conflict do nothing;
 else delete from public.message_reactions where message_id=target_message and user_id=u and emoji=reaction_emoji; end if;
end $$;
revoke all on function public.get_or_create_direct_conversation(uuid),public.invite_channel_member(uuid,uuid),public.set_reaction(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid),public.invite_channel_member(uuid,uuid),public.set_reaction(uuid,text,boolean) to authenticated;
commit;
