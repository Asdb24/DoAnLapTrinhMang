-- New Supabase project only. Auth, Storage and Realtime are provided by Supabase.
begin;
create schema if not exists chat_private;
revoke all on schema chat_private from public, anon, authenticated;
create table public.profiles (
 id uuid primary key references auth.users on delete cascade,
 username text unique check(username ~ '^[a-zA-Z0-9_]{3,32}$'),
 display_name text not null check(char_length(display_name) between 1 and 100),
 avatar_url text not null default '' check(octet_length(avatar_url)<=2800000),
 bio text not null default '' check(char_length(bio)<=1000),
 status_message text not null default '' check(char_length(status_message)<=300),
 role text not null default 'Member' check(char_length(role)<=100),
 presence text not null default 'offline' check(presence in ('online','away','offline')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_settings (
 user_id uuid primary key references public.profiles on delete cascade,
 theme text not null default 'light' check(theme in ('light','dark')),
 density text not null default 'cozy' check(density in ('cozy','compact')),
 enter_to_send boolean not null default true, desktop_notifications boolean not null default false,
 sound_notifications boolean not null default true
);
create table public.conversations (
 id uuid primary key default gen_random_uuid(), type text not null check(type in ('direct','group','saved')),
 title text not null default '' check(char_length(title)<=100), description text not null default '' check(char_length(description)<=1000),
 created_by uuid references public.profiles on delete set null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 last_message_at timestamptz,last_message_id uuid,last_message_preview text not null default '',
 category text check(category in ('Engineering','Design','Product','General','Random')),
 is_private boolean not null default true,direct_key text unique,
 check((type='direct')=(direct_key is not null))
);
create table public.conversation_members (
 conversation_id uuid references public.conversations on delete cascade,user_id uuid references public.profiles on delete cascade,
 role text not null default 'member' check(role in ('owner','admin','member')),joined_at timestamptz not null default now(),
 last_read_at timestamptz,last_read_message_id uuid,cleared_at timestamptz,muted boolean not null default false,
 primary key(conversation_id,user_id)
);
create index members_user on public.conversation_members(user_id,conversation_id);
create table public.messages (
 id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.conversations on delete cascade,
 sender_id uuid references public.profiles on delete set null,content text not null default '' check(octet_length(content)<=10000),
 message_type text not null default 'text' check(message_type in ('text','image','file','system')),
 reply_to_id uuid,client_message_id uuid not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz,
 unique(sender_id,client_message_id),unique(conversation_id,id),
 foreign key(conversation_id,reply_to_id) references public.messages(conversation_id,id)
);
create index messages_cursor on public.messages(conversation_id,created_at desc,id desc);
alter table public.conversations add constraint conversations_last_message_id_fkey foreign key(last_message_id) references public.messages(id) on delete set null;
alter table public.conversation_members add constraint conversation_members_last_read_message_id_fkey foreign key(last_read_message_id) references public.messages(id) on delete set null;
create table public.attachments (
 id uuid primary key,message_id uuid,conversation_id uuid not null references public.conversations on delete cascade,
 uploader_id uuid references public.profiles on delete set null,storage_path text not null unique,
 file_name text not null check(char_length(file_name) between 1 and 255),mime_type text not null,
 file_size bigint not null check(file_size between 1 and 26214400),created_at timestamptz not null default now(),
 foreign key(conversation_id,message_id) references public.messages(conversation_id,id) on delete cascade
);
create index attachments_message on public.attachments(message_id);
create index attachments_uploader on public.attachments(uploader_id,created_at);
create table public.message_reactions (
 message_id uuid references public.messages on delete cascade,user_id uuid references public.profiles on delete cascade,
 emoji text check(char_length(emoji) between 1 and 32 and emoji !~ '[[:cntrl:]]'),created_at timestamptz not null default now(),primary key(message_id,user_id,emoji)
);
create table public.blocked_users (
 user_id uuid references public.profiles on delete cascade,blocked_id uuid references public.profiles on delete cascade,
 created_at timestamptz not null default now(),primary key(user_id,blocked_id),check(user_id<>blocked_id)
);
create table chat_private.rate_buckets(user_id uuid references public.profiles on delete cascade, action text,events timestamptz[] not null default '{}',primary key(user_id,action));
alter table chat_private.rate_buckets enable row level security;
create function chat_private.uid() returns uuid language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); begin if u is null then raise exception 'Authentication required' using errcode='42501'; end if; return u; end $$;
create function chat_private.member(c uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.conversation_members where conversation_id=c and user_id=auth.uid()) $$;
create function chat_private.visible_message(m uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.messages x join public.conversation_members cm on cm.conversation_id=x.conversation_id where x.id=m and cm.user_id=auth.uid() and (cm.cleared_at is null or x.created_at>cm.cleared_at)) $$;
create function chat_private.require_member(c uuid) returns void language plpgsql security definer set search_path='' as $$ begin perform chat_private.uid(); if not chat_private.member(c) then raise exception 'Conversation unavailable' using errcode='42501'; end if; end $$;
create function chat_private.rate(a text, maximum integer,seconds integer) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); ev timestamptz[]; t timestamptz:=clock_timestamp(); begin
 insert into chat_private.rate_buckets(user_id,action) values(u,a) on conflict do nothing;
 select events into ev from chat_private.rate_buckets where user_id=u and action=a for update;
 select coalesce(array_agg(v),'{}') into ev from unnest(ev) v where v>t-make_interval(secs=>seconds);
 if cardinality(ev)>=maximum then raise exception 'Rate limit exceeded' using errcode='P0001'; end if;
 update chat_private.rate_buckets set events=array_append(ev,t) where user_id=u and action=a;
end $$;
create function chat_private.new_user() returns trigger language plpgsql security definer set search_path='' as $$
declare n text:=btrim(new.raw_user_meta_data->>'display_name'); begin
 if n is null or char_length(n) not between 1 and 100 then n:='Member'; end if;
 insert into public.profiles(id,display_name) values(new.id,n);
 insert into public.user_settings(user_id) values(new.id); return new; end $$;
create trigger chat_new_user after insert on auth.users for each row execute function chat_private.new_user();
create function chat_private.profile_updated() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at:=clock_timestamp(); return new; end $$;
create trigger profile_updated before update on public.profiles for each row execute function chat_private.profile_updated();
create function public.get_or_create_direct_conversation(other_user_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); k text; c uuid; begin
 if other_user_id=u or not exists(select 1 from public.profiles where id=other_user_id) then raise exception 'Contact unavailable'; end if;
 if exists(select 1 from public.blocked_users where (user_id=u and blocked_id=other_user_id) or (user_id=other_user_id and blocked_id=u)) then raise exception 'Contact unavailable'; end if;
 k:=least(u::text,other_user_id::text)||':'||greatest(u::text,other_user_id::text);
 insert into public.conversations(type,title,created_by,direct_key) values('direct','Direct message',u,k) on conflict(direct_key) do update set direct_key=excluded.direct_key returning id into c;
 insert into public.conversation_members(conversation_id,user_id) values(c,u),(c,other_user_id) on conflict do nothing; return c; end $$;
create function public.create_channel(channel_name text,channel_description text,channel_category text,private_channel boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); c uuid; begin
 if channel_name is null or btrim(channel_name)='' or char_length(channel_name)>80 then raise exception 'Invalid channel name'; end if;
 perform chat_private.rate('channel',10,60);
 insert into public.conversations(type,title,description,category,is_private,created_by) values('group',btrim(channel_name),channel_description,channel_category,private_channel,u) returning id into c;
 insert into public.conversation_members(conversation_id,user_id,role) values(c,u,'owner'); return c; end $$;
create function public.set_channel_membership(target_conversation uuid,joined boolean) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); c public.conversations; begin
 if joined is null then raise exception 'Invalid membership action'; end if;
 if not joined and not chat_private.member(target_conversation) then return; end if;
 select * into c from public.conversations where id=target_conversation and type='group' for update;
 if not found or (c.is_private and not chat_private.member(c.id)) then raise exception 'Channel unavailable'; end if;
 if joined then insert into public.conversation_members(conversation_id,user_id) values(c.id,u) on conflict do nothing;
 else
 if exists(select 1 from public.conversation_members where conversation_id=c.id and user_id=u and role='owner') then raise exception 'Owner cannot leave'; end if;
 delete from public.conversation_members where conversation_id=c.id and user_id=u; end if; end $$;
create function public.invite_channel_member(target_conversation uuid,target_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); begin
 if not exists(select 1 from public.conversation_members m join public.conversations c on c.id=m.conversation_id where c.id=target_conversation and c.type='group' and m.user_id=u and m.role in ('owner','admin')) then raise exception 'Channel unavailable'; end if;
 insert into public.conversation_members(conversation_id,user_id) values(target_conversation,target_user) on conflict do nothing; end $$;
create function public.mark_conversation_read(target_conversation uuid,read_message_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); m public.messages; begin
 perform chat_private.require_member(target_conversation);
 select * into m from public.messages where id=read_message_id and conversation_id=target_conversation;
 if not found then raise exception 'Message unavailable'; end if;
 update public.conversation_members set last_read_at=m.created_at,last_read_message_id=m.id where conversation_id=target_conversation and user_id=u and (last_read_at is null or (last_read_at,coalesce(last_read_message_id,'00000000-0000-0000-0000-000000000000'::uuid))<(m.created_at,m.id)); end $$;
create function public.set_conversation_muted(target_conversation uuid,muted_value boolean) returns void language plpgsql security definer set search_path='' as $$ begin perform chat_private.require_member(target_conversation); update public.conversation_members set muted=muted_value where conversation_id=target_conversation and user_id=chat_private.uid(); end $$;
create function public.set_reaction(target_message uuid,reaction_emoji text,active boolean) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); begin if not chat_private.visible_message(target_message) then raise exception 'Message unavailable'; end if;
 if active then insert into public.message_reactions(message_id,user_id,emoji) values(target_message,u,reaction_emoji) on conflict do nothing;
 else delete from public.message_reactions where message_id=target_message and user_id=u and emoji=reaction_emoji; end if; end $$;
create function public.clear_my_history() returns void language plpgsql security definer set search_path='' as $$ declare u uuid:=chat_private.uid(); begin update public.conversation_members set cleared_at=clock_timestamp(),last_read_at=clock_timestamp(),last_read_message_id=null where user_id=u; end $$;
create function public.set_blocked(target_user uuid,blocked boolean) returns void language plpgsql security definer set search_path='' as $$ declare u uuid:=chat_private.uid(); begin if blocked then insert into public.blocked_users(user_id,blocked_id) values(u,target_user) on conflict do nothing; else delete from public.blocked_users where user_id=u and blocked_id=target_user; end if; end $$;
create function public.reserve_attachment(target_conversation uuid,upload_id uuid,file_name text,mime_type text,file_size bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); a public.attachments; begin
 perform chat_private.require_member(target_conversation);
 if mime_type not in ('image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain','text/csv','application/zip','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation') or mime_type is null then raise exception 'Unsupported file type'; end if;
 if file_size is null or file_size<1 or file_size>26214400 or (mime_type like 'image/%' and file_size>10485760) then raise exception 'File too large or empty'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,1));
 if (select count(*) from public.attachments x where x.uploader_id=u and x.message_id is null)>=20 or (select coalesce(sum(x.file_size),0) from public.attachments x where x.uploader_id=u)+file_size>1073741824 then raise exception 'Attachment quota exceeded'; end if;
 perform chat_private.rate('upload',20,60);
 insert into public.attachments(id,conversation_id,uploader_id,storage_path,file_name,mime_type,file_size) values(upload_id,target_conversation,u,target_conversation::text||'/'||u::text||'/'||upload_id::text,file_name,mime_type,file_size) returning * into a; return to_jsonb(a); end $$;
create function public.discard_attachment(target_attachment uuid) returns void language plpgsql security definer set search_path='' as $$ declare u uuid:=chat_private.uid(); a public.attachments; begin
 select * into a from public.attachments where id=target_attachment and uploader_id=u and message_id is null for update;
 if not found then raise exception 'Attachment unavailable'; end if;
 if exists(select 1 from storage.objects where bucket_id='chat-attachments' and name=a.storage_path) then raise exception 'Remove uploaded object before discarding reservation'; end if;
 delete from public.attachments where id=a.id; end $$;
create function public.send_message(target_conversation uuid,message_content text,client_id uuid,attachment_ids uuid[] default '{}',reply_to uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); m public.messages; a public.attachments; ids uuid[]; existing_ids uuid[]; begin
 perform chat_private.require_member(target_conversation);
 if client_id is null or message_content is null or attachment_ids is null or octet_length(message_content)>10000 or cardinality(attachment_ids)>5 or (btrim(message_content)='' and cardinality(attachment_ids)=0) then raise exception 'Invalid message'; end if;
 select coalesce(array_agg(v order by v),'{}') into ids from unnest(attachment_ids) v;
 if cardinality(ids)<>(select count(distinct v) from unnest(ids) v) then raise exception 'Duplicate attachment'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||client_id::text,0));
 select * into m from public.messages where sender_id=u and client_message_id=client_id;
 if found then
 select coalesce(array_agg(id order by id),'{}') into existing_ids from public.attachments where message_id=m.id;
 if m.conversation_id<>target_conversation or m.content<>message_content or m.reply_to_id is distinct from reply_to or existing_ids<>ids then raise exception 'Idempotency conflict'; end if;
 return to_jsonb(m); end if;
 if exists(select 1 from public.conversations c join public.conversation_members cm on cm.conversation_id=c.id join public.blocked_users b on (b.user_id=u and b.blocked_id=cm.user_id) or (b.blocked_id=u and b.user_id=cm.user_id) where c.id=target_conversation and c.type='direct') then raise exception 'Contact unavailable'; end if;
 if reply_to is not null and not exists(select 1 from public.messages where id=reply_to and conversation_id=target_conversation and chat_private.visible_message(id)) then raise exception 'Reply unavailable'; end if;
 perform chat_private.rate('message',10,5);
 foreach a.id in array ids loop
 select * into a from public.attachments where id=a.id and uploader_id=u and conversation_id=target_conversation and message_id is null for update;
 if not found then raise exception 'Attachment unavailable'; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='chat-attachments' and o.name=a.storage_path and o.metadata->>'mimetype'=a.mime_type and (o.metadata->>'size')::bigint=a.file_size) then raise exception 'Upload missing or metadata mismatch'; end if;
 end loop;
 insert into public.messages(conversation_id,sender_id,content,client_message_id,reply_to_id,message_type,created_at,updated_at) values(target_conversation,u,message_content,client_id,reply_to,case when cardinality(ids)=0 then 'text' when exists(select 1 from public.attachments where id=any(ids) and mime_type not like 'image/%') then 'file' else 'image' end,clock_timestamp(),clock_timestamp()) returning * into m;
 update public.attachments set message_id=m.id where id=any(ids);
 perform public.mark_conversation_read(target_conversation,m.id); return to_jsonb(m); end $$;
create function chat_private.message_added() returns trigger language plpgsql security definer set search_path='' as $$ begin
 update public.conversations set last_message_id=new.id,last_message_at=new.created_at,last_message_preview=left(case when new.content='' then 'Sent an attachment' else new.content end,200),updated_at=clock_timestamp() where id=new.conversation_id and (last_message_at is null or (last_message_at,last_message_id)<(new.created_at,new.id)); return new; end $$;
create trigger message_added after insert on public.messages for each row execute function chat_private.message_added();
create function public.list_conversations() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); result jsonb; begin
 select coalesce(jsonb_agg(item order by sort_time desc,id),'[]') into result from (
 select c.id,coalesce(c.last_message_at,c.created_at) sort_time,
 to_jsonb(c)||jsonb_build_object('muted',me.muted,'last_read_at',me.last_read_at,'last_read_message_id',me.last_read_message_id,'cleared_at',me.cleared_at,
 'last_message_preview',case when me.cleared_at is not null and (c.last_message_at is null or c.last_message_at<=me.cleared_at) then '' else c.last_message_preview end,
 'unread_count',(select count(*) from public.messages m where m.conversation_id=c.id and m.sender_id is distinct from u and m.deleted_at is null and (me.cleared_at is null or m.created_at>me.cleared_at) and (me.last_read_at is null or (m.created_at,m.id)>(me.last_read_at,coalesce(me.last_read_message_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',cm.user_id,'role',cm.role,'joined_at',cm.joined_at,'last_read_at',cm.last_read_at,'last_read_message_id',cm.last_read_message_id,'cleared_at',cm.cleared_at,'muted',cm.muted,'profile',to_jsonb(p)) order by p.id),'[]') from public.conversation_members cm join public.profiles p on p.id=cm.user_id where cm.conversation_id=c.id)) item
 from public.conversations c join public.conversation_members me on me.conversation_id=c.id and me.user_id=u) q; return result; end $$;
create function public.list_channels() returns jsonb language plpgsql stable security definer set search_path='' as $$ declare u uuid:=chat_private.uid(); result jsonb; begin
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.title,'description',c.description,'category',c.category,'is_private',c.is_private,'is_joined',chat_private.member(c.id),'is_owner',exists(select 1 from public.conversation_members where conversation_id=c.id and user_id=u and role='owner'),'subscriber_count',(select count(*) from public.conversation_members where conversation_id=c.id)) order by c.title,c.id),'[]') into result from public.conversations c where c.type='group' and (not c.is_private or chat_private.member(c.id)); return result; end $$;
-- Browser writes are RPC-only except column-limited updates to the caller's profile/preferences.
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.attachments enable row level security;
alter table public.message_reactions enable row level security;
alter table public.blocked_users enable row level security;
revoke all on public.profiles,public.user_settings,public.conversations,public.conversation_members,public.messages,public.attachments,public.message_reactions,public.blocked_users from anon,authenticated;
grant select on public.profiles,public.user_settings,public.conversations,public.conversation_members,public.messages,public.attachments,public.message_reactions,public.blocked_users to authenticated;
grant update(username,display_name,avatar_url,bio,status_message,role,presence) on public.profiles to authenticated;
grant update(theme,density,enter_to_send,desktop_notifications,sound_notifications) on public.user_settings to authenticated;
create policy profiles_directory on public.profiles for select to authenticated using(auth.uid() is not null);
create policy profiles_self on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy settings_self_read on public.user_settings for select to authenticated using(user_id=auth.uid());
create policy settings_self_write on public.user_settings for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy conversations_member on public.conversations for select to authenticated using(chat_private.member(id));
create policy members_member on public.conversation_members for select to authenticated using(chat_private.member(conversation_id));
create policy messages_member on public.messages for select to authenticated using(chat_private.visible_message(id));
create policy reactions_member on public.message_reactions for select to authenticated using(chat_private.visible_message(message_id));
create policy attachments_member on public.attachments for select to authenticated using(chat_private.member(conversation_id) and ((message_id is not null and chat_private.visible_message(message_id)) or (message_id is null and uploader_id=auth.uid())));
create policy blocks_self on public.blocked_users for select to authenticated using(user_id=auth.uid());
-- Private helpers only expose checks of the current caller, never arbitrary user membership.
revoke all on all functions in schema chat_private from public,anon,authenticated;
grant usage on schema chat_private to authenticated;
grant execute on function chat_private.member(uuid),chat_private.visible_message(uuid) to authenticated;
-- Explicit RPC allowlist: never grant all functions in the public schema.
do $$ declare f text; begin foreach f in array array[
 'get_or_create_direct_conversation(uuid)','list_conversations()','list_channels()',
 'create_channel(text,text,text,boolean)','set_channel_membership(uuid,boolean)','invite_channel_member(uuid,uuid)',
 'send_message(uuid,text,uuid,uuid[],uuid)','mark_conversation_read(uuid,uuid)','set_conversation_muted(uuid,boolean)',
 'set_reaction(uuid,text,boolean)','clear_my_history()','set_blocked(uuid,boolean)',
 'reserve_attachment(uuid,uuid,text,text,bigint)','discard_attachment(uuid)'] loop
 execute 'revoke all on function public.'||f||' from public,anon,authenticated';
 execute 'grant execute on function public.'||f||' to authenticated'; end loop; end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('chat-attachments','chat-attachments',false,26214400,array['image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain','text/csv','application/zip','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create function chat_private.storage_allowed(path text,meta jsonb,operation text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.attachments a where a.storage_path=path and chat_private.member(a.conversation_id) and case operation
 when 'insert' then a.uploader_id=auth.uid() and a.message_id is null and (meta is null or ((meta->>'size')::bigint=a.file_size and meta->>'mimetype'=a.mime_type))
 when 'select' then (a.message_id is not null and chat_private.visible_message(a.message_id)) or (a.message_id is null and a.uploader_id=auth.uid())
 when 'delete' then a.uploader_id=auth.uid() and a.message_id is null else false end) $$;
revoke all on function chat_private.storage_allowed(text,jsonb,text) from public,anon,authenticated;
grant execute on function chat_private.storage_allowed(text,jsonb,text) to authenticated;
create policy chat_upload on storage.objects for insert to authenticated with check(bucket_id='chat-attachments' and chat_private.storage_allowed(name,metadata,'insert'));
create policy chat_download on storage.objects for select to authenticated using(bucket_id='chat-attachments' and chat_private.storage_allowed(name,metadata,'select'));
create policy chat_discard on storage.objects for delete to authenticated using(bucket_id='chat-attachments' and chat_private.storage_allowed(name,metadata,'delete'));
create function chat_private.topic_allowed(topic text) returns boolean language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is null then return false; end if;
 if topic='user:'||auth.uid()::text then return true; end if;
 if topic ~ '^conversation:[0-9a-fA-F-]{36}$' then return chat_private.member(substring(topic from 14)::uuid); end if;
 return false; exception when invalid_text_representation then return false; end $$;
revoke all on function chat_private.topic_allowed(text) from public,anon,authenticated;
grant execute on function chat_private.topic_allowed(text) to authenticated;
create policy chat_realtime_receive on realtime.messages for select to authenticated using(chat_private.topic_allowed(realtime.topic()));
create policy chat_realtime_send on realtime.messages for insert to authenticated with check(realtime.topic() like 'conversation:%' and chat_private.topic_allowed(realtime.topic()));
create function chat_private.notify_conversation() returns trigger language plpgsql security definer set search_path='' as $$
declare c uuid; u uuid; begin
 if tg_table_name='conversations' then c:=new.id; else c:=coalesce(new.conversation_id,old.conversation_id); end if;
 for u in select user_id from public.conversation_members where conversation_id=c loop
 perform realtime.send(jsonb_build_object('conversation_id',c),'conversation_changed','user:'||u::text,true); end loop;
 if tg_op='DELETE' and tg_table_name='conversation_members' then perform realtime.send(jsonb_build_object('conversation_id',c),'conversation_changed','user:'||old.user_id::text,true); end if;
 return null; end $$;
revoke all on function chat_private.notify_conversation() from public,anon,authenticated;
create trigger notify_conversation after insert or update on public.conversations for each row execute function chat_private.notify_conversation();
create trigger notify_member after insert or update or delete on public.conversation_members for each row execute function chat_private.notify_conversation();
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['messages','message_reactions','conversations','conversation_members','attachments'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if; end loop; end if; end $$;
commit;



