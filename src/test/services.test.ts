import { describe,it,expect,vi } from 'vitest';
import { mockCloud,message } from './setup';
import type { MessageRow } from '@/types/database';
const messages=await vi.importActual<typeof import('@/services/messages')>('@/services/messages');
const realtime=await vi.importActual<typeof import('@/services/realtime')>('@/services/realtime');
const storage=await vi.importActual<typeof import('@/services/storage')>('@/services/storage');
const workspace=await vi.importActual<typeof import('@/services/workspace')>('@/services/workspace');

function queryClient(rows:MessageRow[]=[]) {
 const server=mockCloud();
 const query={select:vi.fn(),eq:vi.fn(),or:vi.fn(),order:vi.fn(),limit:vi.fn(async()=>({data:rows,error:null})),in:vi.fn(async()=>({data:rows,error:null}))};
 for(const fn of [query.select,query.eq,query.or,query.order])fn.mockReturnValue(query);
 const attachments=vi.fn(async()=>({data:[{id:'attachment',message_id:rows[0]?.id,file_name:'report.pdf',file_size:1024,mime_type:'application/pdf'}],error:null}));
 const reactions=vi.fn(async()=>({data:[{message_id:rows[0]?.id,user_id:'user-me',emoji:'👍'},{message_id:rows[0]?.id,user_id:'peer',emoji:'👍'}],error:null}));
 const profiles=vi.fn(async()=>({data:[{id:'peer',display_name:'Peer',avatar_url:''}],error:null}));
 const from=vi.fn((table:string)=>table==='messages'?query:{select:()=>({in:table==='attachments'?attachments:table==='message_reactions'?reactions:profiles})});
 Object.assign(server.client,{from});return {server,query,from,attachments,reactions,profiles};
}
const row=(id:string,content=id):MessageRow=>({id,content,conversation_id:'conversation',sender_id:'peer',message_type:'text',media:null,client_message_id:'00000000-0000-0000-0000-000000000001',reply_to_id:null,created_at:'2026-09-19T00:00:00.000Z',updated_at:'2026-09-19T00:00:00.000Z',deleted_at:null});

describe('message service query contracts',()=>{
 it('uses bounded descending tuple pagination and reverses the page for display',async()=>{
  const high='00000000-0000-0000-0000-000000000002',low='00000000-0000-0000-0000-000000000001';
  const db=queryClient([row(high),row(low)]);const result=await messages.messagePage('conversation','user-me',{before:{createdAt:'2026-09-19T00:00:00.000Z',id:high}});
  expect(db.query.eq).toHaveBeenCalledWith('conversation_id','conversation');expect(db.query.or).toHaveBeenCalledWith(`created_at.lt.2026-09-19T00:00:00.000Z,and(created_at.eq.2026-09-19T00:00:00.000Z,id.lt.${high})`);
  expect(db.query.order.mock.calls).toEqual([['created_at',{ascending:false}],['id',{ascending:false}]]);expect(db.query.limit).toHaveBeenCalledWith(40);expect(result.messages.map(m=>m.id)).toEqual([low,high]);expect(result.hasMore).toBe(false);
  expect(db.attachments).toHaveBeenCalledWith('message_id',[low,high]);expect(result.messages[1].attachments?.[0].url).toBe('/api/attachments/attachment');expect(result.messages[1].reactions).toEqual([{emoji:'👍',count:2,reactedByMe:true}]);
 });
 it('fetches reconnect messages in ascending order and rejects malformed cursor filters',async()=>{
  const db=queryClient();const cursor={createdAt:'2026-09-19T00:00:00.000Z',id:'00000000-0000-0000-0000-000000000001'};await messages.messagePage('conversation','user-me',{after:cursor});expect(db.query.order).toHaveBeenCalledWith('id',{ascending:true});expect(db.query.or).toHaveBeenCalledWith(expect.stringContaining('id.gt.'+cursor.id));
  await expect(messages.messagePage('conversation','user-me',{before:{...cursor,id:'evil),or(id.gt.0'}})).rejects.toThrow('Invalid message cursor');
 });
 it('scopes ID hydration to one conversation and hides deleted message attachments and reactions',async()=>{
  const db=queryClient([{...row('deleted'),deleted_at:'2026-09-20T00:00:00.000Z'}]);const result=await messages.messagesById(['deleted'],'conversation','user-me');expect(db.query.eq).toHaveBeenCalledWith('conversation_id','conversation');expect(db.query.in).toHaveBeenCalledWith('id',['deleted']);expect(result[0]).toMatchObject({content:'Message deleted',attachments:[],reactions:[]});
 });
 it('merges updates by ID and orders timestamp collisions by ID',()=>{
  const result=messages.mergeMessages([message('b','old'),message('a')],[message('b','new'),message('c')]);expect(result.map(m=>m.id)).toEqual(['a','b','c']);expect(result[1].content).toBe('new');
 });
});

describe('private Realtime subscription contracts',()=>{
 it('subscribes only the active scope, routes reaction notifications and removes its channel',()=>{
  const server=mockCloud();type Callback=(payload:{extension?:string;status?:string;eventType?:string;new?:Record<string,unknown>;old?:Record<string,unknown>;payload?:Record<string,unknown>})=>void;
  const events:{kind:string;filter:Record<string,string>;callback:Callback}[]=[];let subscribed!:(status:string)=>void;
  const channel={on:vi.fn((kind:string,filter:Record<string,string>,callback:Callback)=>{events.push({kind,filter,callback});return channel;}),subscribe:vi.fn((callback:(status:string)=>void)=>{subscribed=callback;return channel;})};
  const createChannel=vi.fn(()=>channel),removeChannel=vi.fn();Object.assign(server.client,{channel:createChannel,removeChannel});
  const handlers={message:vi.fn(),reconcile:vi.fn(),status:vi.fn()};const stop=realtime.subscribeConversation('conv',handlers);expect(createChannel).toHaveBeenCalledWith('conversation:conv',{config:{private:true}});
  expect(events.filter(e=>e.kind==='postgres_changes').map(e=>e.filter)).toEqual([{event:'*',schema:'public',table:'messages',filter:'conversation_id=eq.conv'},{event:'*',schema:'public',table:'attachments',filter:'conversation_id=eq.conv'}]);
  subscribed('SUBSCRIBED');expect(handlers.reconcile).toHaveBeenCalledOnce();expect(handlers.status).not.toHaveBeenCalled();events.find(e=>e.kind==='system')!.callback({extension:'postgres_changes',status:'ok'});expect(handlers.status).toHaveBeenCalledWith('SUBSCRIBED');expect(handlers.reconcile).toHaveBeenCalledTimes(2);
  events.find(e=>e.filter.event==='reaction_changed')!.callback({payload:{message_id:'m1'}});expect(handlers.message).toHaveBeenCalledWith('m1',false);
  events.find(e=>e.filter.table==='messages')!.callback({eventType:'DELETE',old:{id:'m2'}});expect(handlers.message).toHaveBeenCalledWith('m2',true);
  events.find(e=>e.filter.table==='attachments')!.callback({eventType:'INSERT',new:{message_id:'m3'}});expect(handlers.message).toHaveBeenCalledWith('m3',false);stop();expect(removeChannel).toHaveBeenCalledWith(channel);
 });
});

describe('Storage and settings boundaries',()=>{
 it('normalizes absent/legacy browser MIME consistently and supports backend Office formats',async()=>{
  expect(storage.validateFile(new File(['x'],'slides.pptx'))).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
  expect(storage.validateFile(new File(['x'],'archive.zip',{type:'application/x-zip-compressed'}))).toBe('application/zip');
  expect(()=>storage.validateFile(new File(['x'],'pretend.txt',{type:'text/html'}))).toThrow('not supported');
  expect(()=>storage.validateFile(new File(['x'],'unknown.exe'))).toThrow('not supported');
  const server=mockCloud();server.handlers.set('reserve_attachment',()=>({id:'normalized',storage_path:'conv/user/file'}));
  const upload=vi.fn(async(_path:string,_body:File,_options:unknown)=>({error:null}));Object.assign(server.client,{storage:{from:()=>({upload})}});
  await storage.uploadAttachment(new File(['x'],'notes.txt'),'conv');
  expect(server.client.rpc).toHaveBeenCalledWith('reserve_attachment',expect.objectContaining({mime_type:'text/plain'}));
  expect(upload.mock.calls[0][1].type).toBe('text/plain');
 });
 it('rejects unsafe MIME types and enforces separate image/file limits',()=>{
  expect(()=>storage.validateFile(new File(['x'],'evil.svg',{type:'image/svg+xml'}))).toThrow('not supported');
  const image=new File(['x'],'huge.png',{type:'image/png'});Object.defineProperty(image,'size',{value:10*1024*1024+1});expect(()=>storage.validateFile(image)).toThrow('10 MB');
  const pdf=new File(['x'],'large.pdf',{type:'application/pdf'});Object.defineProperty(pdf,'size',{value:20*1024*1024,configurable:true});expect(()=>storage.validateFile(pdf)).not.toThrow();
  Object.defineProperty(pdf,'size',{value:25*1024*1024+1});expect(()=>storage.validateFile(pdf)).toThrow('25 MB');
 });
 it('reserves before uploading bytes with upsert disabled and returns an authenticated proxy',async()=>{
  const server=mockCloud();server.handlers.set('reserve_attachment',args=>({id:args.upload_id,storage_path:'conv/user/file'}));const upload=vi.fn(async()=>({error:null})),remove=vi.fn();Object.assign(server.client,{storage:{from:vi.fn(()=>({upload,remove}))}});
  const file=new File(['bytes'],'notes.txt',{type:'text/plain'});const result=await storage.uploadAttachment(file,'conv');expect(server.client.rpc).toHaveBeenCalledWith('reserve_attachment',expect.objectContaining({target_conversation:'conv',file_name:'notes.txt',mime_type:'text/plain',file_size:5}));expect(upload).toHaveBeenCalledWith('conv/user/file',file,{contentType:'text/plain',upsert:false});expect(result.url).toBe('/api/attachments/'+result.id);expect(server.client.rpc.mock.invocationCallOrder[0]).toBeLessThan(upload.mock.invocationCallOrder[0]);
 });
 it('cleans the reservation after an upload failure and propagates the original error',async()=>{
  const server=mockCloud();server.handlers.set('reserve_attachment',()=>({id:'reserved',storage_path:'conv/user/file'}));server.handlers.set('claim_attachment_discard',()=>({id:'reserved',storage_path:'conv/user/file'}));const remove=vi.fn(async()=>({error:null}));Object.assign(server.client,{storage:{from:()=>({upload:vi.fn(async()=>({error:{message:'Storage rejected'}})),remove})}});
  await expect(storage.uploadAttachment(new File(['bytes'],'notes.txt',{type:'text/plain'}),'conv')).rejects.toThrow('Storage rejected');expect(remove).toHaveBeenCalledWith(['conv/user/file']);expect(server.client.rpc).toHaveBeenLastCalledWith('discard_attachment',{target_attachment:'reserved'});
 });
 it('never deletes bytes when a concurrent send has already bound the attachment',async()=>{
  const server=mockCloud();server.handlers.set('claim_attachment_discard',()=>null);
  const remove=vi.fn();Object.assign(server.client,{storage:{from:()=>({remove})}});
  await storage.discardAttachment('bound');expect(remove).not.toHaveBeenCalled();
  expect(server.client.rpc).not.toHaveBeenCalledWith('discard_attachment',expect.anything());
 });
 it('keeps a claimed reservation retryable when Storage deletion fails',async()=>{
  const server=mockCloud();server.handlers.set('claim_attachment_discard',()=>({id:'staged',storage_path:'conv/user/file'}));
  const remove=vi.fn(async()=>({error:{message:'Temporary storage failure'}}));Object.assign(server.client,{storage:{from:()=>({remove})}});
  await expect(storage.discardAttachment('staged')).rejects.toThrow('Temporary storage failure');
  expect(server.client.rpc).not.toHaveBeenCalledWith('discard_attachment',expect.anything());
 });
 it('does not save email or an already-resolved avatar proxy as profile metadata',async()=>{
  const server=mockCloud();await workspace.saveSettings({displayName:'Updated',email:'private@example.com',avatar:'/api/avatars/user?v=1'});expect(server.client.rpc).toHaveBeenCalledWith('update_my_settings',{settings:{displayName:'Updated'}});expect(workspace.avatarUrl('avatar:user/version')).toBe('/api/avatars/user?v=version');expect(workspace.avatarUrl('javascript:alert(1)')).toBe('');
 });
});

