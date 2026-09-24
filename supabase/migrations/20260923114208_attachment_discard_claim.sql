-- Claim before deleting Storage bytes. Claims and send_message serialize on the attachment row.
begin;
alter table public.attachments add column deletion_claimed_at timestamptz;
comment on column public.attachments.deletion_claimed_at is 'Irreversible discard claim; excludes attachment from sends and new uploads. Retry Storage deletion then finalize.';
create function public.claim_attachment_discard(target_attachment uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); a public.attachments;
begin
 select * into a from public.attachments where id=target_attachment and uploader_id=u for update;
 if not found or a.message_id is not null then return null; end if;
 update public.attachments set deletion_claimed_at=coalesce(deletion_claimed_at,clock_timestamp()) where id=a.id returning * into a;
 return to_jsonb(a);
end $$;
revoke all on function public.claim_attachment_discard(uuid) from public,anon,authenticated;
grant execute on function public.claim_attachment_discard(uuid) to authenticated;
create or replace function public.discard_attachment(target_attachment uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); a public.attachments;
begin
 select * into a from public.attachments where id=target_attachment and uploader_id=u and message_id is null and deletion_claimed_at is not null for update;
 if not found then raise exception 'Attachment unavailable'; end if;
 if exists(select 1 from storage.objects where bucket_id='chat-attachments' and name=a.storage_path) then raise exception 'Remove uploaded object before discarding reservation'; end if;
 delete from public.attachments where id=a.id;
end $$;
revoke all on function public.discard_attachment(uuid) from public,anon,authenticated;
grant execute on function public.discard_attachment(uuid) to authenticated;
create or replace function chat_private.storage_allowed(path text,meta jsonb,operation text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.attachments a where a.storage_path=path and chat_private.member(a.conversation_id) and case operation
 when 'insert' then a.uploader_id=auth.uid() and a.message_id is null and a.deletion_claimed_at is null
   and (meta->>'size' is null or (meta->>'size')::bigint=a.file_size)
   and (meta->>'mimetype' is null or meta->>'mimetype'=a.mime_type)
 when 'select' then (a.message_id is not null and chat_private.visible_message(a.message_id)) or (a.message_id is null and a.uploader_id=auth.uid())
 when 'delete' then a.uploader_id=auth.uid() and a.message_id is null and a.deletion_claimed_at is not null
 else false end)
$$;
-- CHECK constraints execute as the writing role, including trusted fixture/import writers.
grant usage on schema chat_private to service_role;
grant execute on function chat_private.valid_media(jsonb),chat_private.valid_emoji(text) to service_role;
create or replace function public.send_message(
 target_conversation uuid,message_content text,client_id uuid,
 attachment_ids uuid[] default '{}',reply_to uuid default null,
 message_media jsonb default null,used_emojis text[] default '{}'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=chat_private.uid(); m public.messages; a public.attachments;
 ids uuid[]; existing_ids uuid[]; emojis text[]; emoji text; attachment_id uuid;
begin
 perform chat_private.require_member(target_conversation);
 if client_id is null or message_content is null or attachment_ids is null
  or octet_length(message_content)>10000 or cardinality(attachment_ids)>5
  or (btrim(message_content)='' and cardinality(attachment_ids)=0 and message_media is null)
  then raise exception 'Invalid message'; end if;
 if chat_private.valid_media(message_media) is not true then raise exception 'Invalid message media'; end if;
 if message_media is not null and cardinality(attachment_ids)>0 then raise exception 'Media cannot be combined with file attachments'; end if;
 if used_emojis is null or cardinality(used_emojis)>64 then raise exception 'Invalid emoji usage'; end if;
 foreach emoji in array used_emojis loop
  if chat_private.valid_emoji(emoji) is not true or position(emoji in message_content)=0 then raise exception 'Invalid emoji usage'; end if;
 end loop;
 select coalesce(array_agg(distinct e order by e),'{}') into emojis from unnest(used_emojis) e;
 select coalesce(array_agg(v order by v),'{}') into ids from unnest(attachment_ids) v;
 if cardinality(ids)<>(select count(distinct v) from unnest(ids) v) then raise exception 'Duplicate attachment'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||client_id::text,0));
 select * into m from public.messages where sender_id=u and client_message_id=client_id;
 if found then
  select coalesce(array_agg(id order by id),'{}') into existing_ids from public.attachments where message_id=m.id;
  if m.conversation_id<>target_conversation or m.content<>message_content
   or m.reply_to_id is distinct from reply_to or existing_ids<>ids
   or m.media is distinct from message_media then raise exception 'Idempotency conflict'; end if;
  -- Emoji usage is first-success instrumentation, not an additional mutable message field.
  -- Retry hints (including older clients omitting them) never change existing usage.
  return to_jsonb(m);
 end if;
 if exists(select 1 from public.conversations c
  join public.conversation_members cm on cm.conversation_id=c.id
  join public.blocked_users b on (b.user_id=u and b.blocked_id=cm.user_id) or (b.blocked_id=u and b.user_id=cm.user_id)
  where c.id=target_conversation and c.type='direct') then raise exception 'Contact unavailable'; end if;
 if reply_to is not null and not exists(select 1 from public.messages
  where id=reply_to and conversation_id=target_conversation and chat_private.visible_message(id)) then raise exception 'Reply unavailable'; end if;
 perform chat_private.rate('message',10,5);
 -- Sort UUIDs before locking to avoid inconsistent attachment lock ordering.
 foreach attachment_id in array ids loop
  select * into a from public.attachments where id=attachment_id and uploader_id=u
   and conversation_id=target_conversation and message_id is null and deletion_claimed_at is null for update;
  if not found then raise exception 'Attachment unavailable'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='chat-attachments'
   and o.name=a.storage_path and o.metadata->>'mimetype'=a.mime_type
   and (o.metadata->>'size')::bigint=a.file_size) then raise exception 'Upload missing or metadata mismatch'; end if;
 end loop;
 insert into public.messages(conversation_id,sender_id,content,client_message_id,reply_to_id,message_type,media,created_at,updated_at)
 values(target_conversation,u,message_content,client_id,reply_to,
  case when message_media is not null then message_media->>'kind'
   when cardinality(ids)=0 then 'text'
   when exists(select 1 from public.attachments where id=any(ids) and mime_type not like 'image/%') then 'file'
   else 'image' end,message_media,clock_timestamp(),clock_timestamp()) returning * into m;
 update public.attachments set message_id=m.id where id=any(ids);
 perform public.mark_conversation_read(target_conversation,m.id);
 if message_media is not null then
  perform chat_private.record_media_usage(message_media->>'kind',message_media->>'id',message_media);
 end if;
 foreach emoji in array emojis loop
  perform chat_private.record_media_usage('emoji',emoji,'{}'::jsonb);
 end loop;
 return to_jsonb(m);
end $$;
revoke all on function public.send_message(uuid,text,uuid,uuid[],uuid,jsonb,text[]) from public,anon,authenticated;
grant execute on function public.send_message(uuid,text,uuid,uuid[],uuid,jsonb,text[]) to authenticated;

notify pgrst,'reload schema';
commit;
