import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { ChatFlowProvider,useChatFlow } from '@/context/ChatFlowContext';
import { ChatRoom } from '@/components/chat/ChatRoom';
import { api,ApiError } from '@/lib/api';
import { deferred,fixture,message,mockCloud,json } from './setup';

type Flow=ReturnType<typeof useChatFlow>;let flow:Flow;
function Probe(){flow=useChatFlow();return <div data-testid="workspace">{flow.currentUser.id}:{flow.settings.displayName}</div>;}
async function mount(child:React.ReactNode=<Probe/>){await act(async()=>{render(<ChatFlowProvider>{child}</ChatFlowProvider>);});await screen.findByTestId('workspace');}
async function open(id='c1'){await act(async()=>{flow.setActiveConversationId(id);});await waitFor(()=>expect(flow.loadingMessages).toBe(false));}
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()}),useParams:()=>({id:'c1'}),usePathname:()=>'/'}));

describe('Supabase session and workspace lifecycle',()=>{
 it('loads metadata only, leaves legacy storage untouched and subscribes to the user inbox',async()=>{
  const server=mockCloud();localStorage.setItem('chatflow_conversations','old backup');const write=vi.spyOn(Storage.prototype,'setItem');
  await mount();expect(flow.conversations.every(c=>c.messages.length===0)).toBe(true);expect(flow.currentUser.email).toBe(server.user.email);
  expect(server.loadWorkspace).toHaveBeenCalledWith(server.user);expect(server.messagePage).not.toHaveBeenCalled();expect(server.subscribeInbox).toHaveBeenCalledWith(server.user.id,expect.any(Function));
  expect(write).not.toHaveBeenCalled();expect(localStorage.getItem('chatflow_conversations')).toBe('old backup');
 });
 it('shows loading and a metadata failure, then retries successfully',async()=>{
  const server=mockCloud(),pending=deferred<Awaited<ReturnType<typeof server.loadWorkspace>>>();server.loadWorkspace.mockReturnValueOnce(pending.promise);
  render(<ChatFlowProvider><Probe/></ChatFlowProvider>);expect(screen.getByRole('status')).toHaveTextContent('Connecting');
  await act(async()=>pending.reject(new Error('Workspace unavailable')));expect(await screen.findByRole('alert')).toHaveTextContent('Workspace unavailable');
  fireEvent.click(screen.getByRole('button',{name:'Retry connection'}));await screen.findByTestId('workspace');
 });
 it('uses auth events to clear private state and ignores an older getUser response',async()=>{
  const server=mockCloud(),pending=deferred<Awaited<ReturnType<typeof server.client.auth.getUser>>>();server.client.auth.getUser.mockReturnValueOnce(pending.promise);
  render(<ChatFlowProvider><Probe/></ChatFlowProvider>);
  await act(async()=>server.emitAuth(null));expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  await act(async()=>pending.resolve({data:{user:server.user},error:null}));expect(screen.queryByTestId('workspace')).not.toBeInTheDocument();expect(server.loadWorkspace).not.toHaveBeenCalled();
 });
 it('ignores workspace results from a signed-out account and cleans subscriptions',async()=>{
  const server=mockCloud();await mount();const pending=deferred<Awaited<ReturnType<typeof server.loadWorkspace>>>();server.loadWorkspace.mockReturnValueOnce(pending.promise);
  let refresh!:Promise<boolean>;act(()=>{refresh=flow.refresh();});await act(async()=>server.emitAuth(null));
  await act(async()=>{pending.resolve({state:fixture(),metadata:[]});await refresh;});expect(screen.queryByTestId('workspace')).not.toBeInTheDocument();expect(server.inboxUnsubscribe).toHaveBeenCalledWith(server.user.id);
 });
 it('keeps the newest metadata refresh when requests finish out of order',async()=>{
  const server=mockCloud();await mount();const old=deferred<Awaited<ReturnType<typeof server.loadWorkspace>>>();server.loadWorkspace.mockReturnValueOnce(old.promise);
  let first!:Promise<boolean>;act(()=>{first=flow.refresh();});server.state.settings.displayName='Newest';await act(async()=>{await flow.refresh();});
  await act(async()=>{old.resolve({state:fixture(),metadata:[]});await first;});expect(flow.settings.displayName).toBe('Newest');
 });
 it('debounces inbox notifications and does not poll history',async()=>{
  const server=mockCloud();await mount();vi.useFakeTimers();const before=server.loadWorkspace.mock.calls.length;
  await act(async()=>{server.inboxes.get(server.user.id)!();server.inboxes.get(server.user.id)!();await vi.advanceTimersByTimeAsync(80);});expect(server.loadWorkspace).toHaveBeenCalledTimes(before+1);
  await act(async()=>{await vi.advanceTimersByTimeAsync(15000);});expect(server.loadWorkspace).toHaveBeenCalledTimes(before+1);expect(server.messagePage).not.toHaveBeenCalled();
 });
 it('does not reload the workspace for token refresh with the same user',async()=>{
  const server=mockCloud();await mount();await act(async()=>server.emitAuth({...server.user} as User,'TOKEN_REFRESHED'));expect(server.loadWorkspace).toHaveBeenCalledTimes(1);expect(server.subscribeInbox).toHaveBeenCalledTimes(1);
 });
});

describe('paged messages and scoped Realtime',()=>{
 it('loads only the active conversation, merges older pages without duplicates, and passes the tuple cursor',async()=>{
  const server=mockCloud();const older=message('a','older','2026-09-18T00:00:00.000Z'),first=message('b'),last=message('c');
  server.messagePage.mockResolvedValueOnce({messages:[first,last],hasMore:true}).mockResolvedValueOnce({messages:[older,first],hasMore:false});
  await mount();await open();expect(flow.conversations[0].messages.map(m=>m.id)).toEqual(['b','c']);expect(flow.hasOlder).toBe(true);
  await act(async()=>{expect(await flow.loadOlder()).toBe(true);});expect(server.messagePage).toHaveBeenLastCalledWith('c1',server.user.id,expect.objectContaining({before:{createdAt:first.createdAt,id:'b'}}));
  expect(flow.conversations[0].messages.map(m=>m.id)).toEqual(['a','b','c']);expect(flow.hasOlder).toBe(false);expect(server.subscribeConversation).toHaveBeenCalledTimes(1);
 });
 it('discards late page responses after switching conversations and unsubscribes the old scope',async()=>{
  const server=mockCloud();const pending=deferred<{messages:ReturnType<typeof message>[];hasMore:boolean}>();server.messagePage.mockReturnValueOnce(pending.promise);
  await mount();await act(async()=>flow.setActiveConversationId('c1'));const next=server.state.conversations[1].id;
  await open(next);await act(async()=>pending.resolve({messages:[message('stale')],hasMore:true}));
  expect(flow.conversations.find(c=>c.id==='c1')!.messages).toEqual([]);expect(flow.activeConversationId).toBe(next);expect(server.conversationUnsubscribe).toHaveBeenCalledWith('c1');
 });
 it('deduplicates realtime inserts, refreshes reactions by ID, and removes deleted messages',async()=>{
  const server=mockCloud();server.history.set('c1',[message('m1')]);await mount();await open();
  server.history.set('c1',[{...message('m1'),reactions:[{emoji:'👍',count:1,reactedByMe:false}]},message('m2','incoming','2026-09-20T00:00:00.000Z')]);
  await act(async()=>{const h=server.conversations.get('c1')!;h.message('m2',false);h.message('m2',false);h.message('m1',false);});
  await waitFor(()=>expect(flow.conversations[0].messages).toHaveLength(2));expect(flow.conversations[0].messages[0].reactions?.[0].count).toBe(1);
  await act(async()=>server.conversations.get('c1')!.message('m1',true));await waitFor(()=>expect(flow.conversations[0].messages.map(m=>m.id)).toEqual(['m2']));
 });
 it('reconciles loaded rows plus messages missed during disconnect using the latest cursor',async()=>{
  const server=mockCloud();server.history.set('c1',[message('m1')]);await mount();await open();
  server.history.set('c1',[message('m1','edited'),message('m2','missed','2026-09-20T00:00:00.000Z')]);
  await act(async()=>{server.conversations.get('c1')!.status('SUBSCRIBED');server.conversations.get('c1')!.reconcile();});
  await waitFor(()=>expect(flow.conversations[0].messages.map(m=>m.content)).toEqual(['edited','missed']));expect(flow.realtimeStatus).toBe('SUBSCRIBED');
  expect(server.messagePage).toHaveBeenLastCalledWith('c1',server.user.id,expect.objectContaining({after:{createdAt:'2026-09-19T00:00:00.000Z',id:'m1'}}));
 });
 it('bounds a long reconnect backlog and resets to a pageable latest window',async()=>{
  const server=mockCloud();server.history.set('c1',[message('old')]);await mount();await open();
  const backlog=Array.from({length:300},(_,i)=>message(`new-${String(i).padStart(3,'0')}`,`new-${i}`,new Date(Date.UTC(2026,8,20,0,0,i)).toISOString()));
  server.history.set('c1',[message('old'),...backlog]);
  await act(async()=>server.conversations.get('c1')!.reconcile());
  await waitFor(()=>expect(flow.conversations[0].messages.at(-1)?.id).toBe('new-299'));
  expect(flow.conversations[0].messages).toHaveLength(40);expect(flow.hasOlder).toBe(true);
  expect(server.messagePage).toHaveBeenCalledTimes(7);
 });
 it('sends RPC identity-free payloads and hydrates only the returned message ID',async()=>{
  const server=mockCloud();await mount();await open();const before=flow.conversations[0].messages.length;
  await act(async()=>{expect(await flow.sendMessage('c1','Actual message',[],'retry-key')).toBe(true);});
  expect(server.client.rpc).toHaveBeenCalledWith('send_message',{target_conversation:'c1',message_content:'Actual message',client_id:'retry-key',attachment_ids:[],message_media:null,used_emojis:[]});
  expect(flow.conversations[0].messages).toHaveLength(before+1);expect(flow.conversations[0].messages.at(-1)?.content).toBe('Actual message');
 });
 it('acknowledges unread metadata after the initial page arrives even when hydrated messages have read status',async()=>{
  const server=mockCloud();server.state.conversations[0].unreadCount=2;server.history.set('c1',[message('unread-page')]);
  await mount(<><Probe/><ChatRoom id="c1"/></>);
  await waitFor(()=>expect(server.client.rpc).toHaveBeenCalledWith('mark_conversation_read',{target_conversation:'c1',read_message_id:'unread-page'}));
 });
 it('deduplicates read acknowledgements and retries a failed read',async()=>{
  const server=mockCloud();await mount();await open();server.handlers.set('mark_conversation_read',()=>{throw new Error('Read failed');});
  await act(async()=>{expect(await flow.markConversationAsRead('c1')).toBe(false);});server.handlers.delete('mark_conversation_read');
  await act(async()=>{await flow.markConversationAsRead('c1');await flow.markConversationAsRead('c1');});
  expect(server.client.rpc.mock.calls.filter(([name])=>name==='mark_conversation_read')).toHaveLength(2);
 });
});

describe('RPC actions and failures',()=>{
 it('shows a pending message immediately and confirms without waiting for detail hydration or a workspace reload',async()=>{
  const server=mockCloud();server.history.set('c1',[]);await mount();await open();
  const rpc=deferred<{id:string;created_at:string}>(),details=deferred<ReturnType<typeof message>[]>();
  server.handlers.set('send_message',()=>rpc.promise);server.messagesById.mockReturnValueOnce(details.promise);
  const before=server.loadWorkspace.mock.calls.length;let sent!:Promise<boolean>;
  act(()=>{sent=flow.sendMessage('c1','Immediate',[], 'request-1');});
  expect(flow.conversations[0].messages).toEqual([expect.objectContaining({content:'Immediate',status:'sending'})]);
  await act(async()=>{rpc.resolve({id:'authoritative',created_at:'2026-09-23T00:00:00.000Z'});expect(await sent).toBe(true);});
  expect(flow.conversations[0].messages).toEqual([expect.objectContaining({id:'authoritative',status:'sent'})]);
  expect(server.loadWorkspace).toHaveBeenCalledTimes(before);
  await act(async()=>details.reject(new Error('Details offline')));
  expect(flow.conversations[0].messages[0].status).toBe('sent');
 });
 it.each(['realtime-first','rpc-first'])('reconciles %s by sender and client ID without duplicates',async order=>{
  const server=mockCloud();server.history.set('c1',[]);await mount();await open();
  const rpc=deferred<{id:string;created_at:string}>();server.handlers.set('send_message',()=>rpc.promise);
  const confirmed={...message('real','Once'),senderId:server.user.id,clientMessageId:'same-request',isSentByMe:true,status:'sent' as const};
  let sent!:Promise<boolean>;act(()=>{sent=flow.sendMessage('c1','Once',[],'same-request');});
  server.history.set('c1',[confirmed]);
  if(order==='realtime-first')await act(async()=>server.conversations.get('c1')!.message('real',false));
  await act(async()=>{rpc.resolve({id:'real',created_at:confirmed.createdAt!});await sent;});
  await act(async()=>server.conversations.get('c1')!.message('real',false));
  expect(flow.conversations[0].messages).toHaveLength(1);expect(flow.conversations[0].messages[0].id).toBe('real');
 });
 it('preserves pending sends across reconnect and excludes them from read cursors and ID queries',async()=>{
  const server=mockCloud();server.history.set('c1',[]);await mount();await open();
  const rpc=deferred<{id:string}>();server.handlers.set('send_message',()=>rpc.promise);
  let sent!:Promise<boolean>;act(()=>{sent=flow.sendMessage('c1','Waiting',[],'pending-request');});
  await act(async()=>{server.conversations.get('c1')!.reconcile();await flow.markConversationAsRead('c1');});
  expect(flow.conversations[0].messages[0].status).toBe('sending');
  expect(server.messagesById).not.toHaveBeenCalled();expect(server.client.rpc).not.toHaveBeenCalledWith('mark_conversation_read',expect.anything());
  await act(async()=>{rpc.reject(new Error('Offline'));expect(await sent).toBe(false);});
  expect(flow.conversations[0].messages[0].status).toBe('failed');
 });
 it('does not restore an in-flight send after clearing history',async()=>{
  const server=mockCloud();server.history.set('c1',[]);await mount();await open();
  const rpc=deferred<{id:string}>();server.handlers.set('send_message',()=>rpc.promise);let sent!:Promise<boolean>;
  act(()=>{sent=flow.sendMessage('c1','Before clear',[],'clear-request');});
  await act(async()=>{await flow.clearAllChatHistory();});
  await act(async()=>{rpc.resolve({id:'late-response'});await sent;});
  expect(flow.conversations[0].messages).toHaveLength(0);
 });
 it('uses authorized RPCs for membership, invitations, mute and blocking',async()=>{
  const server=mockCloud();await mount();const channel=server.state.channels.find(c=>!c.isJoined)!;
  await act(async()=>{await flow.toggleJoinChannel(channel.id);await flow.inviteMember(channel.id,'contact-1');await flow.setConversationMuted('c1',true);await flow.unblockUser('block-1');});
  expect(server.client.rpc).toHaveBeenCalledWith('set_channel_membership',{target_conversation:channel.id,joined:true});expect(server.client.rpc).toHaveBeenCalledWith('invite_channel_member',{target_conversation:channel.id,target_user:'contact-1'});
  expect(server.client.rpc).toHaveBeenCalledWith('set_conversation_muted',{target_conversation:'c1',muted_value:true});expect(server.client.rpc).toHaveBeenCalledWith('set_blocked',{target_user:'block-1',blocked:false});
 });
 it('retains settings after save failure and converts avatar bytes before saving',async()=>{
  const server=mockCloud();await mount();server.saveSettings.mockRejectedValueOnce(new Error('Save failed'));
  await act(async()=>{expect(await flow.updateSettings({displayName:'Unsaved'})).toBe(false);});expect(flow.settings.displayName).toBe(server.state.settings.displayName);
  await act(async()=>{await flow.updateSettings({avatar:'data:image/png;base64,AA=='});});expect(server.uploadAvatar).toHaveBeenCalledWith('data:image/png;base64,AA==',server.user.id);expect(server.saveSettings).toHaveBeenLastCalledWith({avatar:'avatar:'+server.user.id+'/avatar-version'});
 });
 it('clears loaded history only after RPC success and prevents older-page reload',async()=>{
  const server=mockCloud();await mount();await open();const before=flow.conversations[0].messages.length;server.handlers.set('clear_my_history',()=>{throw new Error('Clear failed');});
  await act(async()=>{expect(await flow.clearAllChatHistory()).toBe(false);});expect(flow.conversations[0].messages).toHaveLength(before);server.handlers.delete('clear_my_history');
  await act(async()=>{expect(await flow.clearAllChatHistory()).toBe(true);});expect(flow.conversations.every(c=>!c.messages.length)).toBe(true);expect(flow.hasOlder).toBe(false);
 });
 it('does not restore cleared history from a page request already in flight',async()=>{
  const server=mockCloud(),pending=deferred<{messages:ReturnType<typeof message>[];hasMore:boolean}>();server.messagePage.mockReturnValueOnce(pending.promise);
  await mount();await act(async()=>flow.setActiveConversationId('c1'));await waitFor(()=>expect(server.messagePage).toHaveBeenCalledOnce());
  await act(async()=>{expect(await flow.clearAllChatHistory()).toBe(true);});
  await act(async()=>pending.resolve({messages:[message('cleared-message')],hasMore:true}));
  expect(flow.conversations[0].messages).toEqual([]);expect(flow.hasOlder).toBe(false);
 });
 it('keeps authentication after logout failure and signs out only on auth confirmation',async()=>{
  const server=mockCloud();await mount();server.client.auth.signOut.mockResolvedValueOnce({error:{message:'Sign-out failed'}});
  await act(async()=>{expect(await flow.logout()).toBe(false);});expect(screen.getByTestId('workspace')).toBeInTheDocument();
  await act(async()=>{expect(await flow.logout()).toBe(true);});expect(await screen.findByLabelText('Email')).toBeInTheDocument();
 });
 it('cleans auth, inbox and conversation subscriptions on unmount',async()=>{
  const server=mockCloud();const mounted=render(<ChatFlowProvider><Probe/></ChatFlowProvider>);await screen.findByTestId('workspace');await open();mounted.unmount();
  expect(server.authUnsubscribe).toHaveBeenCalledOnce();expect(server.inboxUnsubscribe).toHaveBeenCalledOnce();expect(server.conversationUnsubscribe).toHaveBeenCalledOnce();
 });
});
it('reports malformed and network errors for the account API',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('not json')));await expect(api('/account','DELETE')).rejects.toBeInstanceOf(ApiError);vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('fetch failed')));await expect(api('/account','DELETE')).rejects.toThrow('Unable to connect');});




describe('reaction hydration lifecycle',()=>{
 it('does not restore cleared messages from delayed reaction hydration',async()=>{
  const server=mockCloud();server.history.set('c1',[message('old')]);await mount();await open();
  const details=deferred<ReturnType<typeof message>[]>();server.messagesById.mockReturnValueOnce(details.promise);
  let reaction!:Promise<boolean>;act(()=>{reaction=flow.addReaction('c1','old','👍');});
  await waitFor(()=>expect(server.messagesById).toHaveBeenCalled());
  await act(async()=>{await flow.clearAllChatHistory();});
  await act(async()=>{details.resolve([message('old')]);await reaction;});
  expect(flow.conversations.find(c=>c.id==='c1')!.messages).toEqual([]);
 });
 it('does not inject previous-session reaction details after logout and login',async()=>{
  const server=mockCloud();server.history.set('c1',[message('old')]);await mount();await open();
  const details=deferred<ReturnType<typeof message>[]>();server.messagesById.mockReturnValueOnce(details.promise);
  let reaction!:Promise<boolean>;act(()=>{reaction=flow.addReaction('c1','old','👍');});
  await waitFor(()=>expect(server.messagesById).toHaveBeenCalled());
  await act(async()=>{await flow.logout();});
  server.history.clear();await act(async()=>server.emitAuth(server.user));await screen.findByTestId('workspace');
  await act(async()=>{details.resolve([message('old')]);await reaction;});
  expect(flow.conversations.find(c=>c.id==='c1')!.messages).toEqual([]);
 });
 it('skips hydration if history is cleared while the reaction RPC is pending',async()=>{
  const server=mockCloud();await mount();await open();const pending=deferred<null>();
  server.handlers.set('set_reaction',()=>pending.promise);
  let reaction!:Promise<boolean>;act(()=>{reaction=flow.addReaction('c1','old','👍');});
  await act(async()=>{await flow.clearAllChatHistory();});
  await act(async()=>{pending.resolve(null);await reaction;});
  expect(server.messagesById).not.toHaveBeenCalled();
 });
 it('sends Unicode text unchanged even when its emoji cannot be usage hints',async()=>{
  const server=mockCloud();await mount();await open();
  const text='Keep ↔️ and tiếng Việt';
  await act(async()=>{expect(await flow.sendMessage('c1',text,[],'unicode-request')).toBe(true);});
  expect(server.client.rpc).toHaveBeenCalledWith('send_message',expect.objectContaining({message_content:text,used_emojis:[]}));
 });
});
