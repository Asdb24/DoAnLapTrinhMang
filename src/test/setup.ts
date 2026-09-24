import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { initialBlockedUsers, initialChannels, initialContacts, initialConversations, initialSettings } from '@/lib/mockData';
import type { ApiState } from '@/lib/api';
import type { User } from '@supabase/supabase-js';
import type { MessageType, MessageAttachment, UserSettings } from '@/types';
import type { ConversationMetadata } from '@/types/database';
import type { Cursor } from '@/services/messages';

const bridge=vi.hoisted(()=>({current:null as ReturnType<typeof mockCloud>|null}));
vi.mock('@/lib/supabase/config',()=>({supabaseConfig:()=>({url:'https://test.supabase.co',key:'test-key'})}));
vi.mock('@/lib/supabase/client',()=>({getSupabase:()=>bridge.current!.client}));
vi.mock('@/services/workspace',async importOriginal=>({...await importOriginal<typeof import('@/services/workspace')>(),loadWorkspace:(user:User)=>bridge.current!.loadWorkspace(user),saveSettings:(settings:Partial<UserSettings>)=>bridge.current!.saveSettings(settings)}));
vi.mock('@/services/messages',async importOriginal=>({...await importOriginal<typeof import('@/services/messages')>(),messagePage:(id:string,user:string,options:unknown)=>bridge.current!.messagePage(id,user,options),messagesById:(ids:string[],conversation:string,user:string,metadata:unknown)=>bridge.current!.messagesById(ids,conversation,user,metadata)}));
vi.mock('@/services/storage',()=>({cleanAbandonedUploads:async()=>{},uploadAttachment:(file:File,id:string)=>bridge.current!.uploadAttachment(file,id),discardAttachment:(id:string)=>bridge.current!.discardAttachment(id),uploadAvatar:(data:string,user:string)=>bridge.current!.uploadAvatar(data,user)}));
vi.mock('@/services/realtime',()=>({subscribeInbox:(id:string,changed:()=>void)=>bridge.current!.subscribeInbox(id,changed),subscribeConversation:(id:string,handlers:ConversationHandlers)=>bridge.current!.subscribeConversation(id,handlers)}));

window.HTMLElement.prototype.scrollIntoView=function(){};
window.HTMLElement.prototype.hasPointerCapture=function(){return false;};
window.HTMLElement.prototype.setPointerCapture=function(){};
window.HTMLElement.prototype.releasePointerCapture=function(){};
beforeEach(()=>{localStorage.clear();vi.stubGlobal('ResizeObserver',class{observe(){} unobserve(){} disconnect(){}});});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();bridge.current=null;});
export function fixture():ApiState{return JSON.parse(JSON.stringify({conversations:initialConversations,channels:initialChannels,contacts:initialContacts,settings:initialSettings,blockedUsers:initialBlockedUsers,currentUser:{id:'user-me',email:initialSettings.email},migrationCompleted:true}));}
export function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});}
export function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(reason?:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
export type ConversationHandlers={message:(id:string,deleted:boolean)=>void;reconcile:()=>void;status:(value:string)=>void};
type RpcArgs=Record<string,unknown>;
export function message(id:string,content=id,createdAt='2026-09-19T00:00:00.000Z'):MessageType{return {id,content,createdAt,senderId:'contact-1',senderName:'Sarah Jenkins',isSentByMe:false,date:'Today',timestamp:'12:00',status:'read'};}

/** Supabase service boundaries are mocked; provider, components and merge/cursor logic remain real. */
export function mockCloud(initial=fixture()) {
 const state=initial;
 let authListener:((event:string,session:{user:User}|null)=>void)|undefined;
 const inboxes=new Map<string,()=>void>(),conversations=new Map<string,ConversationHandlers>();
 const handlers=new Map<string,(args:RpcArgs)=>unknown|Promise<unknown>>();
 const user={id:state.currentUser.id,email:state.currentUser.email} as User;
 const history=new Map<string,MessageType[]>(state.conversations.map(c=>[c.id,c.messages.map((m,i)=>({...m,createdAt:new Date(Date.UTC(2026,8,19,0,0,i)).toISOString()}))]));
 const server={state,user,authenticated:true,handlers,history,inboxes,conversations,
  emitAuth(next:User|null,event=next?'SIGNED_IN':'SIGNED_OUT'){server.authenticated=!!next;authListener?.(event,next?{user:next}:null);},
  authUnsubscribe:vi.fn(),inboxUnsubscribe:vi.fn(),conversationUnsubscribe:vi.fn(),
  loadWorkspace:vi.fn(async(_user:User):Promise<{state:ApiState;metadata:ConversationMetadata[]}>=>({state:{...structuredClone(server.state),conversations:server.state.conversations.map(c=>({...structuredClone(c),messages:[]}))},metadata:[] as ConversationMetadata[]})),
  saveSettings:vi.fn(async(settings:Partial<UserSettings>)=>{Object.assign(server.state.settings,settings);}),
  messagePage:vi.fn(async(id:string,_user:string,options:unknown)=>{const opt=options as {before?:Cursor;after?:Cursor};let rows=history.get(id)||[];if(opt?.before)rows=rows.filter(m=>m.createdAt!<opt.before!.createdAt||m.createdAt===opt.before!.createdAt&&m.id<opt.before!.id);if(opt?.after)rows=rows.filter(m=>m.createdAt!>opt.after!.createdAt||m.createdAt===opt.after!.createdAt&&m.id>opt.after!.id);return {messages:structuredClone(opt?.after?rows.slice(0,40):rows.slice(-40)),hasMore:rows.length>=40};}),
  messagesById:vi.fn(async(ids:string[],conversation:string,_user:string,_metadata:unknown)=>structuredClone((history.get(conversation)||[]).filter(m=>ids.includes(m.id)))),
  uploadAttachment:vi.fn(async(file:File,_id:string):Promise<MessageAttachment>=>({id:'upload-1',name:file.name,size:'1 KB',type:'doc',url:'/api/attachments/upload-1'})),
  discardAttachment:vi.fn(async(_id:string)=>{}),
  uploadAvatar:vi.fn(async(_data:string,id:string)=>'avatar:'+id+'/avatar-version'),
  subscribeInbox:vi.fn((id:string,changed:()=>void)=>{inboxes.set(id,changed);return ()=>{inboxes.delete(id);server.inboxUnsubscribe(id);};}),
  subscribeConversation:vi.fn((id:string,callbacks:ConversationHandlers)=>{conversations.set(id,callbacks);return ()=>{conversations.delete(id);server.conversationUnsubscribe(id);};}),
  client:{auth:{
   getUser:vi.fn(async()=>({data:{user:server.authenticated?user:null},error:null as {name:string;message:string}|null})),
   onAuthStateChange:vi.fn((listener:typeof authListener)=>{authListener=listener;return {data:{subscription:{unsubscribe:()=>{authListener=undefined;server.authUnsubscribe();}}}};}),
   signInWithPassword:vi.fn(async(_values:{email:string;password:string})=>{server.emitAuth(user);return {data:{user,session:{user}},error:null as {message:string}|null};}),
   signUp:vi.fn(async(_values:unknown)=>({data:{user,session:null as {user:User}|null},error:null as {message:string}|null})),
   resetPasswordForEmail:vi.fn(async(_email:string,_options:unknown)=>({data:{},error:null as {message:string}|null})),
   updateUser:vi.fn(async(_values:unknown)=>({data:{user},error:null as {message:string}|null})),
   signOut:vi.fn(async(_options?:unknown)=>{server.emitAuth(null);return {error:null as {message:string}|null};}),
  },rpc:vi.fn(async(name:string,args:RpcArgs={})=>{
   try{if(handlers.has(name))return {data:await handlers.get(name)!(args),error:null};
    if(name==='get_or_create_direct_conversation')return {data:'c1',error:null};
    if(name==='send_message'){const m={...message('sent-'+String(args.client_id),String(args.message_content)),senderId:user.id,isSentByMe:true,createdAt:'2026-09-20T00:00:00.000Z'};const id=String(args.target_conversation);history.set(id,[...(history.get(id)||[]),m]);return {data:{id:m.id},error:null};}
    if(name==='mark_conversation_read'){const c=state.conversations.find(c=>c.id===args.target_conversation);if(c)c.unreadCount=0;}
    if(name==='set_channel_membership'){const c=state.channels.find(c=>c.id===args.target_conversation);if(c)c.isJoined=Boolean(args.joined);}
    if(name==='set_conversation_muted'){const c=state.conversations.find(c=>c.id===args.target_conversation);if(c)c.isMuted=Boolean(args.muted_value);}
    if(name==='set_blocked')state.blockedUsers=state.blockedUsers.filter(b=>b.id!==args.target_user);
    if(name==='clear_my_history')history.clear();
    return {data:null,error:null};
   }catch(error){return {data:null,error:{message:error instanceof Error?error.message:String(error)}};}
  })},
 };
 bridge.current=server;return server;
}

