-- Extend the confirmed-message path; no provider API credentials or media bytes in PostgreSQL.
begin;

create function chat_private.valid_media(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; n numeric; url text;
begin
 if value is null then return true; end if;
 if jsonb_typeof(value)<>'object' or octet_length(value::text)>8192 then return false; end if;
 if value->>'kind'='sticker' then
  return (select count(*)=2 from jsonb_object_keys(value))
   and jsonb_typeof(value->'id')='string'
   and value->>'id' in ('orb-v1-happy','orb-v1-love','orb-v1-laugh','orb-v1-thanks','orb-v1-wow','orb-v1-sad','orb-v1-yes','orb-v1-party');
 end if;
 if value->>'kind' is distinct from 'gif' then return false; end if;
 if (select count(*) from jsonb_object_keys(value))<>8 then return false; end if;
 foreach k in array array['kind','provider','id','title','previewUrl','mediaUrl'] loop
  if jsonb_typeof(value->k) is distinct from 'string' then return false; end if;
 end loop;
 if value->>'provider'<>'giphy' or value->>'id' !~ '^[A-Za-z0-9]{1,128}$'
  or char_length(value->>'title')>200 or value->>'title' ~ '[[:cntrl:]]' then return false; end if;
 foreach k in array array['width','height'] loop
  if jsonb_typeof(value->k) is distinct from 'number' then return false; end if;
  n:=(value->>k)::numeric;
  if n<1 or n>4096 or n<>trunc(n) then return false; end if;
 end loop;
 foreach k in array array['previewUrl','mediaUrl'] loop
  url:=value->>k;
  -- Exact CDN hosts, no credentials/ports/fragments, and only image/video paths.
  if char_length(url)>2048 or url !~ '^https://(media[0-4]?|i)\.giphy\.com/[A-Za-z0-9_./%-]+\.(gif|webp|png|mp4)(\?[A-Za-z0-9_=&%.,+/-]*)?$' then return false; end if;
 end loop;
 return true;
end $$;
revoke all on function chat_private.valid_media(jsonb) from public,anon,authenticated;

create function chat_private.valid_emoji(value text) returns boolean
language plpgsql immutable set search_path='' as $$
declare i integer; cp integer; base boolean:=false;
begin
 if value is null or char_length(value) not between 1 and 32 or octet_length(value)>128 then return false; end if;
 -- ASCII is accepted only as a complete keycap emoji, never arbitrary text/IDs.
 if value ~ ('^[#*0-9]'||chr(65039)||'?'||chr(8419)||'$') then return true; end if;
 for i in 1..char_length(value) loop
  cp:=ascii(substr(value,i,1));
  if cp in (8205,65038,65039) or cp between 127995 and 127999 then
   if i=1 then return false; end if;
  elsif cp between 127744 and 129791 or cp between 127462 and 127487
   or cp between 9728 and 10175 or cp between 9193 and 9203 or cp between 9208 and 9210
   or cp between 11013 and 11015 or cp between 11035 and 11036
   or cp in (169,174,8252,8265,8482,8505,8986,8987,9000,9167,9410,11088,11093,12336,12349,12951,12953) then
   base:=true;
  else return false; end if;
 end loop;
 return base and right(value,1)<>chr(8205);
end $$;
revoke all on function chat_private.valid_emoji(text) from public,anon,authenticated;

alter table public.messages add column media jsonb;
alter table public.messages drop constraint messages_message_type_check;
alter table public.messages add constraint messages_message_type_check
 check(message_type in ('text','image','file','system','gif','sticker'));
alter table public.messages add constraint messages_media_check check (
 (media is null and message_type not in ('gif','sticker')) or
 (media is not null and chat_private.valid_media(media) is true
  and message_type in ('gif','sticker') and media->>'kind'=message_type)
);

create table public.media_usage (
 user_id uuid not null references public.profiles(id) on delete cascade,
 type text not null check(type in ('emoji','gif','sticker')),
 media_id text not null check(char_length(media_id) between 1 and 128),
 use_count bigint not null default 1 check(use_count between 1 and 2147483647),
 last_used_at timestamptz not null default now(),
 metadata jsonb not null default '{}' check(octet_length(metadata::text)<=8192),
 primary key(user_id,type,media_id),
 constraint media_usage_payload_check check (
  (type='emoji' and chat_private.valid_emoji(media_id) is true and metadata='{}'::jsonb) or
  (type in ('gif','sticker') and chat_private.valid_media(metadata) is true
   and metadata->>'kind'=type and metadata->>'id'=media_id)
 )
);
-- Serves the user's recent list and deterministic, bounded pruning.
create index media_usage_recent on public.media_usage(user_id,type,last_used_at desc,media_id);
alter table public.media_usage enable row level security;
revoke all on public.media_usage from public,anon,authenticated;
grant select on public.media_usage to authenticated;
create policy media_usage_self on public.media_usage for select to authenticated
 using(user_id=(select auth.uid()));

-- Private helper: no public RPC can increment usage independently of a confirmed send.
create function chat_private.record_media_usage(media_kind text,identifier text,details jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=chat_private.uid();
begin
 -- Serialize pruning with upserts across simultaneous sends for this user.
 perform pg_advisory_xact_lock(hashtextextended(u::text,5));
 insert into public.media_usage(user_id,type,media_id,metadata,last_used_at)
 values(u,media_kind,identifier,details,clock_timestamp())
 on conflict(user_id,type,media_id) do update
 set use_count=least(public.media_usage.use_count+1,2147483647),
     last_used_at=excluded.last_used_at,metadata=excluded.metadata;
 delete from public.media_usage mu where mu.user_id=u and mu.type=media_kind and mu.media_id in (
  select old.media_id from public.media_usage old where old.user_id=u and old.type=media_kind
  order by old.last_used_at desc,old.media_id offset 500
 );
end $$;
revoke all on function chat_private.record_media_usage(text,text,jsonb) from public,anon,authenticated;

-- Drop only the old signature, without CASCADE; defaults retain legacy 3/5-argument callers.
-- One signature avoids PostgREST overload ambiguity. Failure rolls back this transaction.
drop function public.send_message(uuid,text,uuid,uuid[],uuid);
create function public.send_message(
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
   and conversation_id=target_conversation and message_id is null for update;
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

create or replace function chat_private.message_added() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.conversations set last_message_id=new.id,last_message_at=new.created_at,
  last_message_preview=left(case when new.content<>'' then new.content when new.message_type='gif' then 'Sent a GIF'
   when new.message_type='sticker' then 'Sent a sticker' else 'Sent an attachment' end,200),updated_at=clock_timestamp()
 where id=new.conversation_id and (last_message_at is null or (last_message_at,last_message_id)<(new.created_at,new.id));
 return new;
end $$;
revoke all on function chat_private.message_added() from public,anon,authenticated;
comment on table public.media_usage is 'Private first-success media usage. At most 500 recent IDs per user/type via send_message. No message text copied.';
comment on column public.messages.media is 'Validated Giphy GIF metadata or a versioned built-in sticker ID; no file bytes or HTML.';
notify pgrst,'reload schema';
commit;

