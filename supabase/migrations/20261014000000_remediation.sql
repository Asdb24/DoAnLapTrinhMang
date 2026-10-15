-- Recall originals never enter public projections; presence is caller scoped.
begin;

create table chat_private.message_audit (
 message_id uuid primary key,
 original_payload jsonb not null,
 recalled_at timestamptz not null
);
alter table chat_private.message_audit enable row level security;
revoke all on chat_private.message_audit from public,anon,authenticated;
comment on table chat_private.message_audit is 'Privileged recall audit. No browser access or Realtime publication; retention is operator managed.';

create function chat_private.redact_recalled_message() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.deleted_at is not null and new.deleted_at is null then
  raise exception 'Cannot restore recalled message';
 end if;
 if new.deleted_at is not null then
  if tg_op='UPDATE' then
   insert into chat_private.message_audit values(new.id,to_jsonb(old),new.deleted_at) on conflict do nothing;
  else
   insert into chat_private.message_audit values(new.id,to_jsonb(new),new.deleted_at) on conflict do nothing;
  end if;
  new.content:=''; new.media:=null; new.message_type:='system';
 end if;
 return new;
end $$;
revoke all on function chat_private.redact_recalled_message() from public,anon,authenticated;
create trigger redact_recalled_message before insert or update on public.messages
for each row execute function chat_private.redact_recalled_message();

create or replace function public.edit_message(target_message uuid,new_content text) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); m public.messages;
begin
 if new_content is null or octet_length(new_content)>10000 or btrim(new_content)='' then raise exception 'Invalid message content'; end if;
 select * into m from public.messages where id=target_message for update;
 if not found then raise exception 'Message unavailable'; end if;
 perform chat_private.require_member(m.conversation_id);
 if m.sender_id is distinct from u then raise exception 'Only the sender can edit their message'; end if;
 if m.deleted_at is not null then raise exception 'Cannot edit deleted message'; end if;
 update public.messages set content=btrim(new_content),edited_at=clock_timestamp(),updated_at=clock_timestamp() where id=m.id;
end $$;
create or replace function public.delete_message(target_message uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); m public.messages;
begin
 select * into m from public.messages where id=target_message for update;
 if not found then raise exception 'Message unavailable'; end if;
 perform chat_private.require_member(m.conversation_id);
 if m.sender_id is distinct from u then raise exception 'Only the sender can delete their message'; end if;
 if m.deleted_at is not null then raise exception 'Message already deleted'; end if;
 update public.messages set deleted_at=clock_timestamp(),updated_at=clock_timestamp() where id=m.id;
end $$;
revoke all on function public.edit_message(uuid,text),public.delete_message(uuid) from public,anon,authenticated;
grant execute on function public.edit_message(uuid,text),public.delete_message(uuid) to authenticated;

-- Tombstones remain visible for cursors and replies; protected child records do not.
create function chat_private.live_message(target_message uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select chat_private.visible_message(target_message) and exists(select 1 from public.messages where id=target_message and deleted_at is null)
$$;
revoke all on function chat_private.live_message(uuid) from public,anon,authenticated;
grant execute on function chat_private.live_message(uuid) to authenticated;
drop policy reactions_member on public.message_reactions;
create policy reactions_member on public.message_reactions for select to authenticated using(chat_private.live_message(message_id));
drop policy attachments_member on public.attachments;
create policy attachments_member on public.attachments for select to authenticated using(chat_private.member(conversation_id) and
 ((message_id is not null and chat_private.live_message(message_id)) or (message_id is null and uploader_id=auth.uid())));
create or replace function public.set_reaction(target_message uuid,reaction_emoji text,active boolean) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); present boolean;
begin
 -- Serialize reaction changes with recall to avoid creating hidden children after recall.
 perform 1 from public.messages where id=target_message and deleted_at is null for share;
 if not found or not chat_private.live_message(target_message) then raise exception 'Message unavailable'; end if;
 if active is null or reaction_emoji is null or char_length(reaction_emoji) not between 1 and 32 or reaction_emoji ~ '[[:cntrl:]]' then raise exception 'Invalid reaction'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||target_message::text,4));
 select exists(select 1 from public.message_reactions where message_id=target_message and user_id=u and emoji=reaction_emoji) into present;
 if present=active then return; end if;
 perform chat_private.rate('reaction',60,60);
 if active then insert into public.message_reactions(message_id,user_id,emoji) values(target_message,u,reaction_emoji) on conflict do nothing;
 else delete from public.message_reactions where message_id=target_message and user_id=u and emoji=reaction_emoji; end if;
end $$;
revoke all on function public.set_reaction(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.set_reaction(uuid,text,boolean) to authenticated;

create or replace function chat_private.storage_allowed(path text,meta jsonb,operation text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.attachments a where a.storage_path=path and case operation
 when 'insert' then chat_private.member(a.conversation_id) and a.uploader_id=auth.uid() and a.message_id is null and a.deletion_claimed_at is null
  and (meta->>'size' is null or (meta->>'size')::bigint=a.file_size)
  and (meta->>'mimetype' is null or meta->>'mimetype'=a.mime_type)
 when 'select' then chat_private.member(a.conversation_id) and
  ((a.message_id is not null and chat_private.live_message(a.message_id)) or (a.message_id is null and a.uploader_id=auth.uid()))
 when 'delete' then a.uploader_id=auth.uid() and a.message_id is null and a.deletion_claimed_at is not null
 else false end)
$$;
revoke all on function chat_private.storage_allowed(text,jsonb,text) from public,anon,authenticated;
grant execute on function chat_private.storage_allowed(text,jsonb,text) to authenticated;

create function chat_private.message_preview(m public.messages) returns text
language sql immutable set search_path='' as $$
 select left(case when m.deleted_at is not null then 'Message recalled' when m.content<>'' then m.content
 when m.message_type='gif' then 'Sent a GIF' when m.message_type='sticker' then 'Sent a sticker' else 'Sent an attachment' end,200)
$$;
revoke all on function chat_private.message_preview(public.messages) from public,anon,authenticated;
create or replace function chat_private.message_added() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.conversations set last_message_id=new.id,last_message_at=new.created_at,
  last_message_preview=chat_private.message_preview(new),updated_at=clock_timestamp()
 where id=new.conversation_id and
 (last_message_id=new.id or (tg_op='INSERT' and (last_message_at is null or (last_message_at,last_message_id)<(new.created_at,new.id))));
 return new;
end $$;
revoke all on function chat_private.message_added() from public,anon,authenticated;
create trigger message_changed after update of content,media,message_type,deleted_at on public.messages
for each row execute function chat_private.message_added();
-- Upgrade old recalled text/media atomically, preserving the old row privately first.
update public.messages set content='',media=null,message_type='system' where deleted_at is not null;
update public.conversations c set last_message_preview=chat_private.message_preview(m)
from public.messages m where m.id=c.last_message_id;

create function public.can_observe_presence(target_user uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=chat_private.uid();
begin
 return exists(select 1 from public.profiles where id=target_user) and not exists(
  select 1 from public.blocked_users where (user_id=u and blocked_id=target_user) or (blocked_id=u and user_id=target_user));
end $$;
create function chat_private.safe_profile(target_user uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); result jsonb;
begin
 select to_jsonb(p) into result from public.profiles p where p.id=target_user;
 if result is not null and not public.can_observe_presence(target_user) then
  result:=result||jsonb_build_object('presence','offline','updated_at',result->'created_at');
 end if;
 return result;
end $$;
revoke all on function chat_private.safe_profile(uuid) from public,anon,authenticated;
create function public.list_profiles(profile_ids uuid[] default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); result jsonb;
begin
 if cardinality(profile_ids)>1000 then raise exception 'Too many profiles'; end if;
 select coalesce(jsonb_agg(chat_private.safe_profile(p.id) order by p.display_name,p.id),'[]') into result
 from (select id,display_name from public.profiles where profile_ids is null or id=any(profile_ids)
  order by (id=u) desc,display_name,id limit 1000) p;
 return result;
end $$;
revoke all on function public.can_observe_presence(uuid),public.list_profiles(uuid[]) from public,anon,authenticated;
grant execute on function public.can_observe_presence(uuid),public.list_profiles(uuid[]) to authenticated;
revoke select on public.profiles from public,anon,authenticated;
-- updated_at also changes with presence; keep its activity signal behind the projection.
grant select(id,username,display_name,avatar_url,bio,status_message,role,created_at) on public.profiles to authenticated;
create or replace function public.list_conversations() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); result jsonb; begin
 select coalesce(jsonb_agg(item order by sort_time desc,id),'[]') into result from (
 select c.id,coalesce(c.last_message_at,c.created_at) sort_time,
 to_jsonb(c)||jsonb_build_object('muted',me.muted,'last_read_at',me.last_read_at,'last_read_message_id',me.last_read_message_id,'cleared_at',me.cleared_at,
 'last_message_preview',case when me.cleared_at is not null and (c.last_message_at is null or c.last_message_at<=me.cleared_at) then '' else c.last_message_preview end,
 'unread_count',(select count(*) from public.messages m where m.conversation_id=c.id and m.sender_id is distinct from u and m.deleted_at is null and (me.cleared_at is null or m.created_at>me.cleared_at) and (me.last_read_at is null or (m.created_at,m.id)>(me.last_read_at,coalesce(me.last_read_message_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',cm.user_id,'role',cm.role,'joined_at',cm.joined_at,'last_read_at',cm.last_read_at,'last_read_message_id',cm.last_read_message_id,'cleared_at',cm.cleared_at,'muted',cm.muted,'profile',chat_private.safe_profile(p.id)) order by p.id),'[]') from public.conversation_members cm join public.profiles p on p.id=cm.user_id where cm.conversation_id=c.id)) item
 from public.conversations c join public.conversation_members me on me.conversation_id=c.id and me.user_id=u) q; return result; end $$;
revoke all on function public.list_conversations() from public,anon,authenticated;
grant execute on function public.list_conversations() to authenticated;

create function public.list_cleanup_attachments() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=chat_private.uid(); result jsonb;
begin
 select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at,a.id),'[]') into result from
 (select * from public.attachments where uploader_id=u and message_id is null
 and created_at<=clock_timestamp()-interval '24 hours' order by created_at,id limit 20) a;
 return result;
end $$;
revoke all on function public.list_cleanup_attachments() from public,anon,authenticated;
grant execute on function public.list_cleanup_attachments() to authenticated;

notify pgrst,'reload schema';
commit;
