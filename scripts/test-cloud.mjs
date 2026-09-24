import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
loadEnvFile('.env.local');
mkdirSync('test-results',{recursive:true});
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key||!secret)throw new Error('Cloud tests require project URL, public key, and server-only admin key in .env.local.');
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(url,secret,options);
const clients=[];
const accounts=[];
const channels=[];
const storagePaths=[];
const conversations=[];
const checks=[];
const keep=process.argv.includes('--keep');
const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log(`PASS ${name}`);};
const must=result=>{if(result.error)throw new Error(result.error.message);return result.data;};
const timeout=(promise,label,ms=15000)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`Timed out: ${label}`)),ms);})]).finally(()=>clearTimeout(timer));};
function listener(client,conversationId){
  const events=[];const waiters=[];
  let resolveReady,rejectReady;
  const ready=timeout(new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;}),'PostgreSQL subscription readiness');
  const channel=client.channel(`conversation:${conversationId}`,{config:{private:true}})
    .on('system',{},payload=>{if(payload.extension==='postgres_changes'&&payload.status==='ok')resolveReady();})
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`conversation_id=eq.${conversationId}`},payload=>{events.push(payload.new);for(const wake of waiters.splice(0))wake();});
  channels.push([client,channel]);
  channel.subscribe((status,error)=>{if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')rejectReady(error||new Error(status));});
  async function receive(id){await timeout((async()=>{while(!events.some(row=>row.id===id))await new Promise(resolve=>waiters.push(resolve));})(),'receive message');return events.find(row=>row.id===id);}
  return {channel,ready,receive,events};
}
let passed=false;
try{
  for(const label of ['A','B','Outside']){
    const email=`chatflow-test-${label.toLowerCase()}-${randomUUID()}@example.com`;
    const password=randomBytes(24).toString('base64url');
    const {user}=must(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:`Test ${label}`}}));
    accounts.push({id:user.id,email,password});
    const client=createClient(url,key,options);clients.push(client);
    must(await client.auth.signInWithPassword({email,password}));
    check(`Login ${label}`,must(await client.auth.getUser()).user.id===user.id);
    check(`Profile trigger ${label}`,must(await client.from('profiles').select('display_name').eq('id',user.id).single()).display_name===`Test ${label}`);
  }
  const [a,b,c]=clients,[ua,ub]=accounts;
  const id=must(await a.rpc('get_or_create_direct_conversation',{other_user_id:ub.id}));conversations.push(id);
  check('Symmetric direct conversation deduplication',must(await b.rpc('get_or_create_direct_conversation',{other_user_id:ua.id}))===id);
  check('Outsider cannot read conversation',must(await c.from('conversations').select('*').eq('id',id)).length===0);
  check('Outsider cannot read membership',must(await c.from('conversation_members').select('*').eq('conversation_id',id)).length===0);
  const la=listener(a,id),lb=listener(b,id);await Promise.all([la.ready,lb.ready]);check('Both private Realtime subscriptions connected',true);
  const clientId=randomUUID();
  const helloB=must(await a.rpc('send_message',{target_conversation:id,message_content:'Hello B',client_id:clientId}));
  check('User B receives Hello B without refresh',(await lb.receive(helloB.id)).content==='Hello B');
  const helloA=must(await b.rpc('send_message',{target_conversation:id,message_content:'Hello A',client_id:randomUUID()}));
  check('User A receives Hello A without refresh',(await la.receive(helloA.id)).content==='Hello A');
  check('Send retry is idempotent',must(await a.rpc('send_message',{target_conversation:id,message_content:'Hello B',client_id:clientId})).id===helloB.id);
  check('Changed payload cannot reuse client ID',Boolean((await a.rpc('send_message',{target_conversation:id,message_content:'Wrong',client_id:clientId})).error));
  check('Outsider cannot send',Boolean((await c.rpc('send_message',{target_conversation:id,message_content:'intrusion',client_id:randomUUID()})).error));
  check('Direct sender impersonation is rejected',Boolean((await a.from('messages').insert({conversation_id:id,sender_id:ub.id,content:'forged',client_message_id:randomUUID()})).error));
  check('Text limit enforced in database',Boolean((await a.rpc('send_message',{target_conversation:id,message_content:'x'.repeat(10001),client_id:randomUUID()})).error));
  must(await b.rpc('mark_conversation_read',{target_conversation:id,read_message_id:helloB.id}));
  check('Read cursor persisted',must(await a.from('conversation_members').select('last_read_message_id').eq('conversation_id',id).eq('user_id',ub.id).single()).last_read_message_id===helloA.id);
  must(await b.rpc('set_reaction',{target_message:helloB.id,reaction_emoji:'👍',active:true}));
  check('Reaction persisted',must(await a.from('message_reactions').select('*').eq('message_id',helloB.id)).length===1);
  const contents=new TextEncoder().encode('ChatFlow private upload test');
  const attachment=must(await a.rpc('reserve_attachment',{target_conversation:id,upload_id:randomUUID(),file_name:'hello.txt',mime_type:'text/plain',file_size:contents.length}));storagePaths.push(attachment.storage_path);
  must(await a.storage.from('chat-attachments').upload(attachment.storage_path,contents,{contentType:'text/plain',upsert:false}));
  const fileMessage=must(await a.rpc('send_message',{target_conversation:id,message_content:'Private file',client_id:randomUUID(),attachment_ids:[attachment.id]}));
  await lb.receive(fileMessage.id);check('Attachment message arrives over Realtime',true);
  check('Recipient sees attachment metadata',must(await b.from('attachments').select('*').eq('message_id',fileMessage.id)).length===1);
  check('Recipient downloads original file',await must(await b.storage.from('chat-attachments').download(attachment.storage_path)).text()==='ChatFlow private upload test');
  check('Outsider cannot read attachment metadata',must(await c.from('attachments').select('*').eq('id',attachment.id)).length===0);
  check('Outsider cannot download private file',Boolean((await c.storage.from('chat-attachments').download(attachment.storage_path)).error));
  check('Public file URL is denied',!(await fetch(`${url}/storage/v1/object/public/chat-attachments/${attachment.storage_path}`)).ok);
  check('Disallowed MIME rejected',Boolean((await a.rpc('reserve_attachment',{target_conversation:id,upload_id:randomUUID(),file_name:'bad.html',mime_type:'text/html',file_size:100})).error));
  check('Oversized image rejected',Boolean((await a.rpc('reserve_attachment',{target_conversation:id,upload_id:randomUUID(),file_name:'big.png',mime_type:'image/png',file_size:10*1024*1024+1})).error));
  const stickerPayload={target_conversation:id,message_content:'',client_id:randomUUID(),message_media:{kind:'sticker',id:'orb-v1-love'}};
  const sticker=must(await a.rpc('send_message',stickerPayload));
  check('Sticker receives stable media ID over Realtime',(await lb.receive(sticker.id)).media.id==='orb-v1-love');
  check('Sticker retry returns the same committed row',must(await a.rpc('send_message',stickerPayload)).id===sticker.id);
  const gifMedia={kind:'gif',provider:'giphy',id:'3o7aD2saalBwwftBIY',title:'Cloud GIF regression fixture',mediaUrl:'https://media.giphy.com/media/3o7aD2saalBwwftBIY/giphy.gif',previewUrl:'https://media.giphy.com/media/3o7aD2saalBwwftBIY/giphy.gif',width:200,height:200};
  const gif=must(await a.rpc('send_message',{target_conversation:id,message_content:'',client_id:randomUUID(),message_media:gifMedia}));
  check('GIF metadata receives through the private Realtime channel',(await lb.receive(gif.id)).media.id===gifMedia.id);
  const emoji=must(await a.rpc('send_message',{target_conversation:id,message_content:'Hello 👍🏽 ❤️',client_id:randomUUID(),used_emojis:['👍🏽','❤️']}));
  check('Unicode emoji remains an ordinary text message',(await lb.receive(emoji.id)).message_type==='text');
  const usage=must(await a.from('media_usage').select('*'));
  check('Confirmed GIF, sticker and emoji sends personalize only their sender',usage.length===4&&usage.every(row=>row.user_id===ua.id));
  check('Idempotent sticker retry does not increase usage',usage.find(row=>row.media_id==='orb-v1-love').use_count===1);
  check('Recipient cannot inspect sender personalization',must(await b.from('media_usage').select('*').eq('user_id',ua.id)).length===0);
  check('Outsider cannot inspect sender personalization',must(await c.from('media_usage').select('*').eq('user_id',ua.id)).length===0);
  check('Client cannot forge personal usage counts',Boolean((await a.from('media_usage').insert({user_id:ua.id,type:'emoji',media_id:'🔥',use_count:999})).error));
  check('Arbitrary GIF host rejected',Boolean((await a.rpc('send_message',{target_conversation:id,message_content:'',client_id:randomUUID(),message_media:{...gifMedia,mediaUrl:'https://evil.example/file.gif'}})).error));
  await b.removeChannel(lb.channel);
  const missed=must(await a.rpc('send_message',{target_conversation:id,message_content:'Sent while B was offline',client_id:randomUUID()}));
  const lb2=listener(b,id);await lb2.ready;
  const catchup=must(await b.from('messages').select('*').eq('conversation_id',id).gt('created_at',fileMessage.created_at));
  check('Reconnect catches missed PostgreSQL messages',catchup.some(row=>row.id===missed.id));
  for(let i=0;i<2;i++){
    const fresh=createClient(url,key,options);clients.push(fresh);
    must(await fresh.auth.signInWithPassword({email:accounts[i].email,password:accounts[i].password}));
    const rows=must(await fresh.from('messages').select('*').eq('conversation_id',id).order('created_at').order('id'));
    check(`Fresh client ${i===0?'A':'B'} restores persisted messages`,rows.some(row=>row.id===helloA.id)&&rows.some(row=>row.id===helloB.id)&&rows.some(row=>row.id===fileMessage.id));
  }
  // Controlled test fixtures verify stable pagination even when server timestamps collide.
  const stamp=new Date().toISOString();
  const fixtures=Array.from({length:55},(_,i)=>({id:randomUUID(),conversation_id:id,sender_id:ua.id,content:`Pagination ${i}`,client_message_id:randomUUID(),created_at:stamp}));
  must(await admin.from('messages').insert(fixtures));
  const page1=must(await b.from('messages').select('*').eq('conversation_id',id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(40));
  const cursor=page1.at(-1);
  const page2=must(await b.from('messages').select('*').eq('conversation_id',id).or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(40));
  check('Cursor pages have no duplicate or missing tied timestamps',new Set([...page1,...page2].map(row=>row.id)).size===62&&page1.length===40);
  const rateResults=await Promise.all(Array.from({length:15},(_,i)=>a.rpc('send_message',{target_conversation:id,message_content:`Rate test ${i}`,client_id:randomUUID()})));
  check('Trusted send rate limit rejects floods',rateResults.some(result=>result.error?.message.includes('Rate limit')));
  check('Unauthorized user sees no messages',must(await c.from('messages').select('*').eq('conversation_id',id)).length===0);
  passed=true;
  if(keep)writeFileSync('.env.cloud-test.local',JSON.stringify({project:url,accounts,conversationId:id,attachmentId:attachment.id,storagePaths},null,2));
}finally{
  for(const client of clients)await client.removeAllChannels();
  if(!keep||!passed){
    if(storagePaths.length)must(await admin.storage.from('chat-attachments').remove(storagePaths));
    for(const id of conversations)must(await admin.from('conversations').delete().eq('id',id));
    for(const account of accounts)must(await admin.auth.admin.deleteUser(account.id));
  }
  writeFileSync('test-results/cloud.json',JSON.stringify({date:new Date().toISOString(),project:url,passed,checks,keptTestAccounts:keep&&passed},null,2));
}
console.log(`Cloud verification passed: ${checks.length} assertions.`);

