import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const db = new PGlite();
await db.exec(await readFile(new URL('../supabase/tests/bootstrap.sql',import.meta.url),'utf8'));
await db.exec('create role service_role nologin bypassrls; grant usage on schema public to service_role');
for(const f of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
assert.equal((await db.query("select count(*)::integer n from pg_publication_tables where pubname='supabase_realtime'")).rows[0].n,5);
const ids=[randomUUID(),randomUUID(),randomUUID()];
for(const id of ids) await db.query(`insert into auth.users(id,raw_user_meta_data) values($1,'{"display_name":"Tester","role":"admin","email":"secret@example.com"}')`,[id]);
let count=0;
async function reactionEvents(){await db.exec('reset role');try{return (await db.query("select * from realtime.test_events where event='reaction_changed'")).rows;}finally{await db.exec('set role authenticated');}}
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
async function as(i,fn){await db.exec('set role authenticated');await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[ids[i]]);try{return await fn();}finally{await db.exec('reset role');}}
async function denied(fn,pattern){await assert.rejects(fn,pattern);count++;}
const rpc=async(name,args=[]) => (await q(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args))[0].value;
const dm=await as(0,()=>rpc('get_or_create_direct_conversation',[ids[1]]));
assert.equal(dm,await as(1,()=>rpc('get_or_create_direct_conversation',[ids[0]])));count++;
const privateChannel=await as(0,()=>rpc('create_channel',['private','secret','General',true]));
const publicChannel=await as(0,()=>rpc('create_channel',['public','description','General',false]));
await as(2,async()=>{
 assert.equal((await q('select * from public.conversations')).length,0);count++;
 assert.equal((await rpc('list_channels')).length,1);count++;
 await denied(()=>rpc('set_channel_membership',[privateChannel,true]));
 await denied(()=>rpc('invite_channel_member',[privateChannel,ids[2]]));
 await denied(()=>rpc('send_message',[dm,'intrusion',randomUUID()]));
 await denied(()=>q('insert into public.conversation_members(conversation_id,user_id) values($1,$2)',[dm,ids[2]]));
 await denied(()=>q('insert into public.messages(conversation_id,sender_id,client_message_id,content) values($1,$2,$3,$4)',[dm,ids[0],randomUUID(),'impersonation']));
 await denied(()=>q('select * from chat_private.rate_buckets'));
 await rpc('set_channel_membership',[publicChannel,true]);await rpc('set_channel_membership',[publicChannel,true]);
});
await as(0,()=>rpc('invite_channel_member',[privateChannel,ids[1]]));
await as(1,async()=>{await rpc('set_channel_membership',[privateChannel,true]);await rpc('set_channel_membership',[privateChannel,false]);await rpc('set_channel_membership',[privateChannel,false]);count++;});
await as(0,()=>rpc('invite_channel_member',[privateChannel,ids[1]]));
await as(0,()=>denied(()=>rpc('set_channel_membership',[privateChannel,false])));
let msg;
const client=randomUUID();
await as(0,async()=>{
 msg=await rpc('send_message',[dm,'hello',client]);
 assert.equal(msg.sender_id,ids[0]);count++;
 assert.equal((await rpc('send_message',[dm,'hello',client])).id,msg.id);count++;
 await denied(()=>rpc('send_message',[dm,'different',client]));
 await denied(()=>rpc('send_message',[privateChannel,'hello',client]));
 await denied(()=>rpc('send_message',[dm,'é'.repeat(5001),randomUUID()]));
 await denied(()=>rpc('send_message',[privateChannel,'reply',randomUUID(),[],msg.id]));
 const list=await rpc('list_conversations');assert.ok(!('messages' in list[0]));assert.ok(list.find(c=>c.id===dm).members[0].profile);count++;
 const a=await rpc('reserve_attachment',[dm,randomUUID(),'a.pdf','application/pdf',20]);
 await denied(()=>rpc('send_message',[dm,'file',randomUUID(),[a.id]]));
 await denied(()=>rpc('reserve_attachment',[dm,randomUUID(),'bad.svg','image/svg+xml',20]));
 await denied(()=>rpc('reserve_attachment',[dm,randomUUID(),'big.png','image/png',10485761]));
 await denied(()=>rpc('reserve_attachment',[dm,randomUUID(),'big.pdf','application/pdf',26214401]));
 await denied(()=>q(`insert into storage.objects(bucket_id,name,metadata) values('chat-attachments',$1,$2)`,[a.storage_path,{size:21,mimetype:'application/pdf'}]));
 // Storage preflight may omit finalized size, but committing a message cannot.
 for(const metadata of [null,{}, {mimetype:'application/pdf',contentLength:500}, {size:20}]) {
  await q(`insert into storage.objects(bucket_id,name,metadata) values('chat-attachments',$1,$2)`,[a.storage_path,metadata]);count++;
  await denied(()=>rpc('send_message',[dm,'unfinished upload',randomUUID(),[a.id]]));
  await db.exec('reset role');
  await q(`delete from storage.objects where bucket_id='chat-attachments' and name=$1`,[a.storage_path]);
  await db.exec('set role authenticated');
 }
 await denied(()=>q(`insert into storage.objects(bucket_id,name,metadata) values('chat-attachments',$1,$2)`,[a.storage_path,{mimetype:'text/html',contentLength:20}]));
 await denied(()=>q(`insert into storage.objects(bucket_id,name,metadata) values('chat-attachments',$1,$2)`,[a.storage_path,{size:21}]));
 await q(`insert into storage.objects(bucket_id,name,metadata) values('chat-attachments',$1,$2)`,[a.storage_path,{size:20,mimetype:'application/pdf'}]);
 const attached=await rpc('send_message',[dm,'file',randomUUID(),[a.id]]);assert.equal(attached.message_type,'file');count++;
 await denied(()=>rpc('discard_attachment',[a.id]));
});
await as(2,async()=>{assert.equal((await q('select * from public.messages')).length,0);assert.equal((await q('select * from storage.objects')).length,0);count+=2;await denied(()=>rpc('set_reaction',[msg.id,'👍',true]));});
await as(1,async()=>{
 await rpc('set_reaction',[msg.id,'👍',true]);await rpc('set_reaction',[msg.id,'👍',true]);assert.equal((await q('select * from public.message_reactions')).length,1);count++;
  const events=await reactionEvents();
 assert.deepEqual(events,[{topic:'conversation:'+dm,event:'reaction_changed',payload:{message_id:msg.id},private:true}]);count++;
 await rpc('set_reaction',[msg.id,'👍',false]);await rpc('set_reaction',[msg.id,'👍',false]);
 assert.equal((await reactionEvents()).length,2);count++;
 assert.equal((await q('select * from public.message_reactions')).length,0);count++;
 await rpc('mark_conversation_read',[dm,msg.id]);await denied(()=>rpc('mark_conversation_read',[privateChannel,msg.id]));
 await rpc('set_blocked',[ids[0],true]);await denied(()=>rpc('send_message',[dm,'blocked',randomUUID()]));await rpc('set_blocked',[ids[0],false]);
 await rpc('clear_my_history');assert.equal((await q('select * from public.messages where conversation_id=$1',[dm])).length,0);count++;
});
await as(0,async()=>{assert.ok((await q('select * from public.messages where conversation_id=$1',[dm])).length>0);count++;});
// Timestamp collision pagination uses both created_at and UUID, never timestamp alone.
await db.query(`update public.messages set created_at='2026-01-01' where conversation_id=$1`,[dm]);
await as(0,async()=>{const first=(await q('select * from public.messages where conversation_id=$1 order by created_at desc,id desc limit 1',[dm]))[0];const next=await q('select * from public.messages where conversation_id=$1 and (created_at,id)<($2::timestamptz,$3::uuid) order by created_at desc,id desc limit 1',[dm,first.created_at,first.id]);assert.equal(next.length,1);assert.notEqual(next[0].id,first.id);count++;});
await db.exec('delete from chat_private.rate_buckets');
await as(0,async()=>{for(let i=0;i<10;i++)await rpc('send_message',[dm,'rate '+i,randomUUID()]);await denied(()=>rpc('send_message',[dm,'rate11',randomUUID()]));});
await as(0,async()=>{
 const before=(await q('select display_name from public.profiles where id=$1',[ids[1]]))[0].display_name;
 await q(`update public.profiles set display_name='forged' where id=$1`,[ids[1]]);
 assert.equal((await q('select display_name from public.profiles where id=$1',[ids[1]]))[0].display_name,before);count++;
 await rpc('update_my_settings',[{displayName:'Updated',theme:'dark'}]);
 await denied(()=>rpc('update_my_settings',[{displayName:'Rollback',theme:'invalid'}]));
 assert.equal((await q('select display_name from public.profiles where id=$1',[ids[0]]))[0].display_name,'Updated');count++;
 await denied(()=>rpc('update_my_settings',[{avatar:'data:image/png;base64,AA=='}]));
 await denied(()=>rpc('update_my_settings',[{id:ids[1]}]));
 assert.equal((await q("select chat_private.topic_allowed($1) value",['user:'+ids[1]]))[0].value,false);count++;
});
await db.exec('set role anon');await denied(()=>rpc('list_conversations'));await db.exec('reset role');
// Cursor updates are monotonic even if clients submit an older message later.
await as(0,async()=>{
 const rows=await q('select * from public.messages where conversation_id=$1 order by created_at desc,id desc',[dm]);
 await rpc('mark_conversation_read',[dm,rows[0].id]);await rpc('mark_conversation_read',[dm,rows.at(-1).id]);
 assert.equal((await q('select last_read_message_id from public.conversation_members where conversation_id=$1 and user_id=$2',[dm,ids[0]]))[0].last_read_message_id,rows[0].id);count++;
 const path=ids[0]+'/'+randomUUID();
 await q(`insert into storage.objects(bucket_id,name,metadata) values('profile-avatars',$1,$2)`,[path,{size:100,mimetype:'image/png'}]);
 await denied(()=>q(`insert into storage.objects(bucket_id,name,metadata) values('profile-avatars',$1,$2)`,[ids[1]+'/'+randomUUID(),{size:100,mimetype:'image/png'}]));
 await denied(()=>q(`insert into storage.objects(bucket_id,name,metadata) values('profile-avatars',$1,$2)`,[ids[0]+'/'+randomUUID(),{size:2097153,mimetype:'image/png'}]));
 await denied(()=>rpc('update_my_settings',[{avatar:'avatar:'+ids[1]+'/'+randomUUID()}]));
 await q(`insert into storage.objects(bucket_id,name,metadata) values('profile-avatars',$1,$2)`,[ids[0]+'/'+randomUUID(),{mimetype:'image/png',contentLength:500}]);count++;
 await denied(()=>q(`insert into storage.objects(bucket_id,name,metadata) values('profile-avatars',$1,$2)`,[ids[0]+'/'+randomUUID(),{mimetype:'image/svg+xml',contentLength:500}]));
 await denied(()=>q(`insert into storage.objects(bucket_id,name,metadata) values('profile-avatars',$1,$2)`,[ids[0]+'/'+randomUUID(),{size:2097153}]));
 await rpc('update_my_settings',[{avatar:'avatar:'+path}]);
 await db.query(`select set_config('realtime.topic',$1,false)`,['conversation:'+dm]);
 await q(`insert into realtime.messages(topic,payload) values($1,'{}')`,['conversation:'+dm]);
});
await as(2,async()=>{
 await db.query(`select set_config('realtime.topic',$1,false)`,['conversation:'+dm]);
 assert.equal((await q('select * from realtime.messages')).length,0);count++;
 await denied(()=>q(`insert into realtime.messages(topic,payload) values($1,'{}')`,['conversation:'+dm]));
 await db.query(`select set_config('realtime.topic',$1,false)`,['user:'+ids[2]]);
 await denied(()=>q(`insert into realtime.messages(topic,payload) values($1,'{}')`,['user:'+ids[2]]));
});
assert.ok((await q('select * from realtime.test_events')).length>0);count++;
assert.ok((await q("select payload from realtime.test_events where event='conversation_changed'")).every(e=>Object.keys(e.payload).join(',')==='conversation_id'));count++;
// Real FK/schema constraints also hold for privileged writers.
await denied(()=>q(`insert into public.messages(conversation_id,sender_id,content,client_message_id) values($1,$2,$3,$4)`,[dm,ids[0],'x'.repeat(10001),randomUUID()]));
await denied(()=>q(`insert into public.messages(conversation_id,sender_id,content,client_message_id,reply_to_id) values($1,$2,'bad reply',$3,$4)`,[privateChannel,ids[0],randomUUID(),msg.id]));
await denied(()=>q(`update public.profiles set presence='invisible' where id=$1`,[ids[0]]));
// Authenticate all resource-abuse calls; inspect only fixture state as postgres.
await db.exec('delete from chat_private.rate_buckets');
const targets=[];
for(let i=0;i<31;i++){const id=randomUUID();targets.push(id);await q("insert into auth.users(id,raw_user_meta_data) values($1,'{}')",[id]);}
const eventCountBefore=(await q('select count(*)::integer n from realtime.test_events'))[0].n;
await as(0,async()=>{for(let i=0;i<3;i++)assert.equal(await rpc('get_or_create_direct_conversation',[ids[1]]),dm);});
assert.equal((await q('select count(*)::integer n from realtime.test_events'))[0].n,eventCountBefore);count++;
await as(0,async()=>{
 for(let i=0;i<20;i++)await rpc('get_or_create_direct_conversation',[targets[i]]);
 await denied(()=>rpc('get_or_create_direct_conversation',[targets[20]]));
 assert.equal(await rpc('get_or_create_direct_conversation',[ids[1]]),dm);count++;
 for(let i=0;i<30;i++)await rpc('invite_channel_member',[privateChannel,targets[i]]);
 await denied(()=>rpc('invite_channel_member',[privateChannel,targets[30]]));
 await rpc('invite_channel_member',[privateChannel,targets[0]]);count++;
 for(let i=0;i<60;i++)await rpc('set_reaction',[msg.id,'👍',i%2===0]);
 await denied(()=>rpc('set_reaction',[msg.id,'👍',true]));
 await rpc('set_reaction',[msg.id,'👍',false]);count++;
});
assert.equal((await q('select count(*)::integer n from public.conversation_members where conversation_id=$1 and user_id=$2',[privateChannel,targets[30]]))[0].n,0);count++;
assert.equal((await q('select cardinality(events) n from chat_private.rate_buckets where user_id=$1 and action=$2',[ids[0],'reaction']))[0].n,60);count++;

// Media migration: full confirmed-send path under authenticated roles, never a usage RPC.
await db.exec('delete from chat_private.rate_buckets');
assert.equal((await q("select count(*)::integer n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='send_message'"))[0].n,1);count++;
assert.equal((await q("select to_regprocedure('public.send_message(uuid,text,uuid,uuid[],uuid)') old"))[0].old,null);count++;
const sendSignature='public.send_message(uuid,text,uuid,uuid[],uuid,jsonb,text[])';
assert.equal((await q("select has_function_privilege('anon',$1,'EXECUTE') allowed",[sendSignature]))[0].allowed,false);count++;
assert.equal((await q("select has_function_privilege('authenticated',$1,'EXECUTE') allowed",[sendSignature]))[0].allowed,true);count++;
assert.equal((await q("select has_function_privilege('authenticated','chat_private.record_media_usage(text,text,jsonb)','EXECUTE') allowed"))[0].allowed,false);count++;
const security=(await q("select prosecdef,proconfig from pg_proc where oid=$1::regprocedure",[sendSignature]))[0];
assert.equal(security.prosecdef,true);assert.ok(security.proconfig.some(value=>value==='search_path=\"\"'));count++;
const gif={kind:'gif',provider:'giphy',id:'testGif123',title:'Happy GIF',previewUrl:'https://media0.giphy.com/media/testGif123/200w.webp',mediaUrl:'https://media.giphy.com/media/testGif123/giphy.gif?cid=abc&rid=giphy.gif&ct=g',width:320,height:240};
const stickerIds=['orb-v1-happy','orb-v1-love','orb-v1-laugh','orb-v1-thanks','orb-v1-wow','orb-v1-sad','orb-v1-yes','orb-v1-party'];
let gifMessage,stickerMessage;
const gifRequest=randomUUID();
await as(0,async()=>{
 gifMessage=await rpc('send_message',[dm,'',gifRequest,[],null,gif,[]]);
 assert.equal(gifMessage.message_type,'gif');assert.deepEqual(gifMessage.media,gif);count++;
 assert.equal((await rpc('send_message',[dm,'',gifRequest,[],null,{...gif},[]])).id,gifMessage.id);count++;
 assert.equal((await q("select use_count from public.media_usage where type='gif' and media_id=$1",[gif.id]))[0].use_count,1);count++;
 await denied(()=>rpc('send_message',[dm,'',gifRequest,[],null,{...gif,title:'Changed title'},[]]));
 await denied(()=>rpc('send_message',[privateChannel,'',gifRequest,[],null,gif,[]]));
 await denied(()=>rpc('send_message',[dm,'',gifRequest,[],null,{kind:'sticker',id:stickerIds[0]},[]]));
 assert.equal((await q('select media from public.messages where id=$1',[gifMessage.id]))[0].media.id,gif.id);count++;
 assert.equal((await rpc('list_conversations')).find(c=>c.id===dm).last_message_preview,'Sent a GIF');count++;
 await rpc('send_message',[dm,'Caption',randomUUID(),[],null,gif,[]]);
 assert.equal((await q("select use_count from public.media_usage where type='gif' and media_id=$1",[gif.id]))[0].use_count,2);count++;
 for(const id of stickerIds){stickerMessage=await rpc('send_message',[dm,'',randomUUID(),[],null,{kind:'sticker',id},[]]);assert.equal(stickerMessage.message_type,'sticker');count++;}
 assert.equal((await rpc('list_conversations')).find(c=>c.id===dm).last_message_preview,'Sent a sticker');count++;
 await denied(()=>rpc('send_message',[dm,'',randomUUID(),[],null,gif,[]])); // Same 10 / 5s limit for media.
 await denied(()=>q("insert into public.media_usage(user_id,type,media_id) values($1,'emoji','👍')",[ids[0]]));
 await denied(()=>q('update public.media_usage set use_count=999 where user_id=$1',[ids[0]]));
 await denied(()=>q('delete from public.media_usage where user_id=$1',[ids[0]]));
 await denied(()=>q("select chat_private.record_media_usage('emoji','👍','{}')"));
});
await as(1,async()=>{
 assert.equal((await q('select * from public.media_usage')).length,0);count++;
 assert.equal((await q('select media from public.messages where id=$1',[gifMessage.id]))[0].media.id,gif.id);count++;
});
await as(2,async()=>{
 assert.equal((await q('select * from public.media_usage where user_id=$1',[ids[0]])).length,0);count++;
 assert.equal((await q('select media from public.messages where id=$1',[gifMessage.id])).length,0);count++;
 await denied(()=>rpc('send_message',[dm,'',randomUUID(),[],null,gif,[]]));
});
await db.exec('set role anon');await denied(()=>q('select * from public.media_usage'));await denied(()=>rpc('send_message',[dm,'',randomUUID(),[],null,gif,[]]));await db.exec('reset role');

await db.exec('delete from chat_private.rate_buckets');
await as(0,async()=>{
 const before=(await q('select count(*)::integer n from public.messages where conversation_id=$1',[dm]))[0].n;
 const invalidMedia=[{},[],{kind:'sticker',id:'unknown'}, {kind:'sticker',id:stickerIds[0],extra:'hidden data'},
  {...gif,provider:'other'}, {...gif,id:'has spaces'}, {...gif,id:'x'.repeat(129)}, {...gif,title:'x'.repeat(201)}, {...gif,title:'bad\n'},
  {...gif,width:0}, {...gif,width:4097}, {...gif,width:1.5}, {...gif,width:'NaN'}, {...gif,width:null}, {...gif,height:'Infinity'},
  {...gif,extra:'arbitrary private message'}, {...gif,extra:'x'.repeat(9000)},
  {...gif,previewUrl:'https://example.com/a.gif'}, {...gif,mediaUrl:'http://media.giphy.com/a.gif'},
  {...gif,mediaUrl:'https://media.giphy.com.evil.example/a.gif'}, {...gif,mediaUrl:'https://media.giphy.com@evil.example/a.gif'},
  {...gif,mediaUrl:'https://media.giphy.com:443/a.gif'}, {...gif,mediaUrl:'https://evil.example/?https://media.giphy.com/a.gif'},
  {...gif,mediaUrl:'javascript:alert(1)'}, {...gif,mediaUrl:'data:image/gif;base64,AA=='},
  {...gif,mediaUrl:'https://media.giphy.com/a.html'}, {...gif,mediaUrl:'https://media.giphy.com/a.gif#fragment'},
  {...gif,mediaUrl:'https://media5.giphy.com/a.gif'}, {...gif,mediaUrl:'https://media.giphy.com/a.gif?x=<script>'},
  {...gif,previewUrl:'https://media.giphy.com/'+ 'a'.repeat(2050)+'.gif'}];
 const missingWidth={...gif};delete missingWidth.width;invalidMedia.push(missingWidth);
 for(const media of invalidMedia)await denied(()=>rpc('send_message',[dm,'',randomUUID(),[],null,media,[]]),/Invalid message media/);
 await denied(()=>rpc('send_message',[dm,'caption',randomUUID(),[randomUUID()],null,gif,[]]));
 await denied(()=>rpc('send_message',[privateChannel,'reply',randomUUID(),[],gifMessage.id,gif,[]]));
 assert.equal((await q('select count(*)::integer n from public.messages where conversation_id=$1',[dm]))[0].n,before);count++;
});
// Failed block/attachment validation cannot increment recommendations or bind a file.
await as(1,()=>rpc('set_blocked',[ids[0],true]));
await as(0,()=>denied(()=>rpc('send_message',[dm,'',randomUUID(),[],null,gif,[]])));
await as(1,()=>rpc('set_blocked',[ids[0],false]));
await as(0,async()=>{
 const variants=['👍','👍🏽','👩‍💻','❤️','🇻🇳','1️⃣'];
 const content=variants.join(' '),client=randomUUID();
 const sent=await rpc('send_message',[dm,content,client,[],null,null,[...variants,'👍']]);
 assert.equal(sent.message_type,'text');assert.equal(sent.media,null);count++;
 const usage=await q("select * from public.media_usage where type='emoji'");assert.equal(usage.length,variants.length);assert.ok(usage.every(r=>r.use_count===1&&JSON.stringify(r.metadata)==='{}'));count++;
 assert.equal((await rpc('send_message',[dm,content,client,[],null,null,variants])).id,sent.id);count++;
 assert.equal((await rpc('send_message',[dm,content,client])).id,sent.id);count++;
 assert.ok((await q("select use_count from public.media_usage where type='emoji'")).every(r=>r.use_count===1));count++;
 for(const invalid of ['private message','https://example.com','abc👍','123','\u200d','🏽','👍'.repeat(33),null])await denied(()=>rpc('send_message',[dm,'👍 '+invalid,randomUUID(),[],null,null,[invalid]]));
 await denied(()=>rpc('send_message',[dm,'No selected emoji',randomUUID(),[],null,null,['👍']]));
 await denied(()=>rpc('send_message',[dm,'👍',randomUUID(),[],null,null,Array(65).fill('👍')]));
 await denied(()=>rpc('send_message',[dm,'👍',randomUUID(),[],null,null,null]));
 const sixtyFour=Array.from({length:64},(_,i)=>String.fromCodePoint(0x1f600+i));
 await rpc('send_message',[dm,sixtyFour.join(''),randomUUID(),[],null,null,sixtyFour]);
 assert.equal((await q("select count(*)::integer n from public.media_usage where type='emoji' and media_id=any($1::text[])",[sixtyFour]))[0].n,64);count++;
});
// Inject a downstream database failure to prove message, attachment binding, preview,
// broadcast and usage are one transaction, not independently successful operations.
await db.exec(`create function chat_private.test_reject_usage() returns trigger language plpgsql as $$ begin raise exception 'injected usage failure'; end $$;
create trigger test_reject_usage before insert or update on public.media_usage for each row execute function chat_private.test_reject_usage();`);
const atomicId=randomUUID(),eventBefore=(await q('select count(*)::integer n from realtime.test_events'))[0].n;
let staged;
await as(0,async()=>{
 staged=await rpc('reserve_attachment',[dm,randomUUID(),'atomic.txt','text/plain',1]);
 await q("insert into storage.objects(bucket_id,name,metadata) values('chat-attachments',$1,$2)",[staged.storage_path,{size:1,mimetype:'text/plain'}]);
 await denied(()=>rpc('send_message',[dm,'👍',atomicId,[staged.id],null,null,['👍']]));
 assert.equal((await q('select * from public.messages where client_message_id=$1',[atomicId])).length,0);count++;
 assert.equal((await q('select message_id from public.attachments where id=$1',[staged.id]))[0].message_id,null);count++;
});
assert.equal((await q('select count(*)::integer n from realtime.test_events'))[0].n,eventBefore);count++;
await db.exec('drop trigger test_reject_usage on public.media_usage;drop function chat_private.test_reject_usage()');
await as(0,async()=>{const sent=await rpc('send_message',[dm,'👍',atomicId,[staged.id],null,null,['👍']]);assert.equal(sent.message_type,'file');count++;});

// Seed a full recommendation cache as the fixture administrator, then prune through a real send.
// This avoids bypassing the message rate limit or sending hundreds of fake messages.
await q("delete from public.media_usage where user_id=$1 and type='gif'",[ids[0]]);
for(const owner of [ids[0],ids[1]])await q(`insert into public.media_usage(user_id,type,media_id,use_count,last_used_at,metadata)
select $1,'gif','cache'||i,1,'2026-01-01'::timestamptz + i*interval '1 second',jsonb_set($2::jsonb,'{id}',to_jsonb('cache'||i)) from generate_series(1,500) i`,[owner,gif]);
await as(0,async()=>{
 await rpc('send_message',[dm,'',randomUUID(),[],null,{...gif,id:'cache500'},[]]);
 assert.equal((await q("select use_count from public.media_usage where type='gif' and media_id='cache500'"))[0].use_count,2);count++;
 await rpc('send_message',[dm,'',randomUUID(),[],null,gif,[]]);
 assert.equal((await q("select count(*)::integer n from public.media_usage where type='gif'"))[0].n,500);count++;
 assert.equal((await q("select * from public.media_usage where type='gif' and media_id='cache1'")).length,0);count++;
 assert.equal((await q("select * from public.media_usage where type='gif' and media_id=$1",[gif.id])).length,1);count++;
 assert.equal((await q("select count(*)::integer n from public.media_usage where type='sticker'"))[0].n,8);count++;
});
await as(1,async()=>{assert.equal((await q("select count(*)::integer n from public.media_usage where type='gif'"))[0].n,500);assert.equal((await q("select * from public.media_usage where type='gif' and media_id='cache1'")).length,1);count++;});
await denied(()=>q("insert into public.messages(conversation_id,sender_id,client_message_id,message_type,media) values($1,$2,$3,'text',$4)",[dm,ids[0],randomUUID(),gif]));
await denied(()=>q("insert into public.messages(conversation_id,sender_id,client_message_id,message_type) values($1,$2,$3,'gif')",[dm,ids[0],randomUUID()]));
await denied(()=>q("insert into public.media_usage(user_id,type,media_id,metadata) values($1,'emoji','private text','{}')",[ids[0]]));


// Discard claims serialize with sends; exercise both possible committed orders.
await db.exec('truncate chat_private.rate_buckets');
assert.equal((await q("select has_function_privilege('authenticated','public.claim_attachment_discard(uuid)','execute') allowed"))[0].allowed,true);count++;
assert.equal((await q("select has_function_privilege('anon','public.claim_attachment_discard(uuid)','execute') allowed"))[0].allowed,false);count++;
const claimDefinition=(await q("select pg_get_functiondef('public.claim_attachment_discard(uuid)'::regprocedure) definition"))[0].definition;
assert.match(claimDefinition,/SECURITY DEFINER/);assert.match(claimDefinition,/search_path TO ''/);assert.match(claimDefinition,/for update/i);count++;
const sendDefinition=(await q("select pg_get_functiondef('public.send_message(uuid,text,uuid,uuid[],uuid,jsonb,text[])'::regprocedure) definition"))[0].definition;
assert.match(sendDefinition,/deletion_claimed_at is null for update/i);count++;
const discardDraft=await as(0,()=>rpc('reserve_attachment',[dm,randomUUID(),'discard.pdf','application/pdf',20]));
await as(0,async()=>{
 await q("insert into storage.objects(bucket_id,name,metadata) values('chat-attachments',$1,$2)",[discardDraft.storage_path,{size:20,mimetype:'application/pdf'}]);
 assert.equal((await q("delete from storage.objects where name=$1 returning id",[discardDraft.storage_path])).length,0);count++;
 await denied(()=>rpc('discard_attachment',[discardDraft.id]),/Attachment unavailable/);
 await denied(()=>q('update public.attachments set deletion_claimed_at=now() where id=$1',[discardDraft.id]));
});
await as(1,async()=>{
 assert.equal(await rpc('claim_attachment_discard',[discardDraft.id]),null);count++;
 await denied(()=>rpc('discard_attachment',[discardDraft.id]));
});
await as(2,async()=>{assert.equal(await rpc('claim_attachment_discard',[discardDraft.id]),null);count++;});
await db.exec('set role anon');await denied(()=>rpc('claim_attachment_discard',[discardDraft.id]));await db.exec('reset role');
let claimed;
await as(0,async()=>{
 assert.equal(await rpc('claim_attachment_discard',[randomUUID()]),null);count++;
 claimed=await rpc('claim_attachment_discard',[discardDraft.id]);
 assert.equal(claimed.storage_path,discardDraft.storage_path);assert.ok(claimed.deletion_claimed_at);count++;
 assert.equal((await rpc('claim_attachment_discard',[discardDraft.id])).deletion_claimed_at,claimed.deletion_claimed_at);count++;
 await denied(()=>rpc('send_message',[dm,'must not bind',randomUUID(),[discardDraft.id]]),/Attachment unavailable/);
 await denied(()=>rpc('discard_attachment',[discardDraft.id]),/Remove uploaded object/);
});
await as(1,async()=>{assert.equal((await q('delete from storage.objects where name=$1 returning id',[discardDraft.storage_path])).length,0);count++;});
await as(0,async()=>{
 assert.equal((await q('delete from storage.objects where name=$1 returning id',[discardDraft.storage_path])).length,1);count++;
 for(const metadata of [null,{}, {size:20,mimetype:'application/pdf'}])await denied(()=>q("insert into storage.objects(bucket_id,name,metadata) values('chat-attachments',$1,$2)",[discardDraft.storage_path,metadata]));
 await rpc('discard_attachment',[discardDraft.id]);
 assert.equal((await q('select * from public.attachments where id=$1',[discardDraft.id])).length,0);count++;
 assert.equal(await rpc('claim_attachment_discard',[discardDraft.id]),null);count++;
});
// Send wins first: cleanup must neither claim nor delete its bytes; retries stay idempotent.
await as(0,async()=>{
 const draft=await rpc('reserve_attachment',[dm,randomUUID(),'sent.pdf','application/pdf',20]);
 await q("insert into storage.objects(bucket_id,name,metadata) values('chat-attachments',$1,$2)",[draft.storage_path,{size:20,mimetype:'application/pdf'}]);
 const clientId=randomUUID(),sent=await rpc('send_message',[dm,'send wins',clientId,[draft.id]]);
 assert.equal(await rpc('claim_attachment_discard',[draft.id]),null);count++;
 assert.equal((await q('delete from storage.objects where name=$1 returning id',[draft.storage_path])).length,0);count++;
 assert.equal((await rpc('send_message',[dm,'send wins',clientId,[draft.id]])).id,sent.id);count++;
 await denied(()=>rpc('discard_attachment',[draft.id]));
 assert.equal((await q('select deletion_claimed_at from public.attachments where id=$1',[draft.id]))[0].deletion_claimed_at,null);count++;
 // A reservation whose upload never started can be claimed and finalized without an object.
 const empty=await rpc('reserve_attachment',[dm,randomUUID(),'empty.pdf','application/pdf',20]);
 await rpc('claim_attachment_discard',[empty.id]);await rpc('discard_attachment',[empty.id]);count++;
});
// Service-role writers evaluate CHECK helpers as themselves, without browser helper grants.
await db.exec('grant insert,select,update on public.messages,public.media_usage to service_role');
await db.exec('set role service_role');
for(const [kind,media] of [['text',null],['sticker',{kind:'sticker',id:'orb-v1-happy'}]]){
 await q('insert into public.messages(conversation_id,sender_id,client_message_id,content,message_type,media) values($1,$2,$3,$4,$5,$6)',[dm,ids[0],randomUUID(),'admin fixture',kind,media]);count++;
}
await q("insert into public.media_usage(user_id,type,media_id,metadata) values($1,'emoji',$2,'{}') on conflict(user_id,type,media_id) do update set use_count=public.media_usage.use_count+1",[ids[0],'👍']);count++;
await denied(()=>q('insert into public.messages(conversation_id,sender_id,client_message_id,content,message_type,media) values($1,$2,$3,$4,$5,$6)',[dm,ids[0],randomUUID(),'invalid fixture','sticker',{kind:'sticker',id:'unknown'}]),/messages_media_check/);
await db.exec('reset role');
for(const role of ['anon','authenticated'])for(const fn of ['valid_media(jsonb)','valid_emoji(text)']){
 assert.equal((await q("select has_function_privilege($1,$2,'execute') allowed",[role,'chat_private.'+fn]))[0].allowed,false);count++;
}

await q('delete from auth.users where id=$1',[ids[0]]);
assert.equal((await q('select sender_id from public.messages where id=$1',[msg.id]))[0].sender_id,null);count++;
assert.equal((await q('select role from public.conversation_members where conversation_id=$1 and user_id=$2',[privateChannel,ids[1]]))[0].role,'owner');count++;
assert.equal((await q('select * from public.profiles where id=$1',[ids[0]])).length,0);count++;
assert.equal((await q('select * from public.media_usage where user_id=$1',[ids[0]])).length,0);count++;
assert.equal((await q("select count(*)::integer n from public.media_usage where user_id=$1 and type='gif'",[ids[1]]))[0].n,500);count++;
console.log(`PASS: ${count} PostgreSQL/RLS assertions (PGlite). Storage HTTP validation and Realtime delivery are mocked and require Cloud integration tests.`);
await db.close();








