"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Channel, MessageAttachment, MessageType, UserSettings } from '@/types';
import type { ConversationMetadata, MessageRow } from '@/types/database';
import { api, type ApiState } from '@/lib/api';
import { appOrigin } from '@/lib/public-url.mjs';
import { getSupabase } from '@/lib/supabase/client';
import { supabaseConfig } from '@/lib/supabase/config';
import { check, loadWorkspace, saveSettings } from '@/services/workspace';
import { cursorOf, isUnconfirmed, mergeMessages, messagePage, messagesById, PAGE_SIZE } from '@/services/messages';
import { cleanAbandonedUploads, discardAttachment, uploadAttachment, uploadAvatar } from '@/services/storage';
import { subscribeConversation, subscribeInbox } from '@/services/realtime';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { Button } from '@/components/ui/button';
import type { ChatMedia } from '@/types/media';
import { usedEmojis } from '@/services/media';

type NewChannel = Pick<Channel,'name'|'description'|'category'|'isPrivate'>;
interface ChatFlowContextType extends ApiState {
  activeConversationId:string|null;
  setActiveConversationId:(id:string|null)=>void;
  sendMessage:(id:string,content:string,attachments?:MessageAttachment[],clientId?:string,media?:ChatMedia)=>Promise<boolean>;
  addReaction:(id:string,messageId:string,emoji:string)=>Promise<boolean>;
  markConversationAsRead:(id:string)=>Promise<boolean>;
  openChannelChat:(id:string)=>Promise<string|null>;
  toggleJoinChannel:(id:string)=>Promise<boolean>;
  createChannel:(channel:NewChannel)=>Promise<Channel|null>;
  setConversationMuted:(id:string,muted:boolean)=>Promise<boolean>;
  inviteMember:(channelId:string,contactId:string)=>Promise<boolean>;
  updateSettings:(settings:Partial<UserSettings>)=>Promise<boolean>;
  unblockUser:(id:string)=>Promise<boolean>;
  clearAllChatHistory:()=>Promise<boolean>;
  deleteAccount:()=>Promise<boolean>;
  logout:()=>Promise<boolean>;
  refresh:()=>Promise<boolean>;
  uploadFile:(file:File,conversationId?:string)=>Promise<MessageAttachment|null>;
  discardUpload:(id:string)=>Promise<boolean>;
  loadOlder:()=>Promise<boolean>;
  hasOlder:boolean;
  loadingMessages:boolean;
  realtimeStatus:string;
  newChatDialogOpen:boolean;
  setNewChatDialogOpen:(open:boolean)=>void;
  startDirectChat:(id:string)=>Promise<string|null>;
  pending:boolean;
  error:string|null;
  dismissError:()=>void;
}
const ChatFlowContext=createContext<ChatFlowContextType|undefined>(undefined);
export function ChatFlowProvider({children}:{children:React.ReactNode}) {
  const [state,setState]=useState<ApiState|null>(null);
  const stateRef=useRef<ApiState|null>(null);
  const [user,setUser]=useState<User|null>(null);
  const userRef=useRef<User|null>(null);
  const generation=useRef(0);
  const clearGeneration=useRef(0);
  const metadata=useRef<ConversationMetadata[]>([]);
  const [status,setStatus]=useState<'loading'|'ready'|'unauthenticated'|'error'>('loading');
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [pendingCount,setPendingCount]=useState(0);
  const [activeConversationId,setActiveConversationId]=useState<string|null>(null);
  const [newChatDialogOpen,setNewChatDialogOpen]=useState(false);
  const [hasOlder,setHasOlder]=useState(false);
  const [loadingMessages,setLoadingMessages]=useState(false);
  const [realtimeStatus,setRealtimeStatus]=useState('CONNECTING');
  const [historyVersion,setHistoryVersion]=useState(0);
  const activeRef=useRef<string|null>(null);
  const activeEpoch=useRef(0);
  const alive=useRef(true);
  const refreshVersion=useRef(0);
  const readPending=useRef(new Map<string,string>());
  const reconcileActive=useRef<(()=>void)|null>(null);
  const configured=Boolean(supabaseConfig());
  const apply=useCallback((next:ApiState)=>{stateRef.current=next;setState(next);setStatus('ready');},[]);
  const report=useCallback((cause:unknown)=>{if(alive.current)setError(cause instanceof Error?cause.message:'Unable to complete the action. Please retry.');},[]);
  const run=useCallback(async <T,>(work:()=>Promise<T>,busy=true):Promise<T|null>=>{
    const epoch=generation.current;
    if(busy)setPendingCount(n=>n+1);
    try{return await work();}catch(cause){if(epoch===generation.current)report(cause);return null;}
    finally{if(alive.current&&busy)setPendingCount(n=>Math.max(0,n-1));}
  },[report]);
  const refreshState=useCallback(async()=>{
    const current=userRef.current;if(!current)return false;
    const version=++refreshVersion.current,epoch=generation.current;
    const result=await loadWorkspace(current);
    if(!alive.current||epoch!==generation.current||version!==refreshVersion.current)return false;
    metadata.current=result.metadata;
    result.state.conversations=result.state.conversations.map(conv=>{
      const info=result.metadata.find(row=>row.id===conv.id);
      const messages=(stateRef.current?.conversations.find(c=>c.id===conv.id)?.messages||[])
        .filter(message=>!info?.cleared_at || (message.createdAt||'')>info.cleared_at)
        .map(message=>({...message,status:!isUnconfirmed(message)&&message.isSentByMe && info?.members.some(member=>member.user_id!==current.id&&member.last_read_at&& (member.last_read_at>(message.createdAt||'') || member.last_read_at===message.createdAt&&(member.last_read_message_id||'')>=message.id))?'read' as const:message.status}));
      return {...conv,messages};
    });
    if(activeRef.current&&!result.state.conversations.some(conv=>conv.id===activeRef.current))setActiveConversationId(null);
    apply(result.state);return true;
  },[apply]);
  const refresh=useCallback(async()=> (await run(async()=>{const ok=await refreshState();if(ok){setError(null);reconcileActive.current?.();}return ok;}))??false,[refreshState,run]);
  const replaceMessages=useCallback((id:string,incoming:MessageType[],replace=false)=>{
    const current=stateRef.current;if(!current)return;
    apply({...current,conversations:current.conversations.map(conv=>conv.id===id?{...conv,messages:mergeMessages(replace?conv.messages.filter(isUnconfirmed):conv.messages,incoming)}:conv)});
  },[apply]);
  useEffect(()=>{
    alive.current=true;
    if(!configured){setStatus('error');return()=>{alive.current=false;};}
    const client=getSupabase();let mounted=true;
    const accept=(next:User|null)=>{
      if(!mounted)return;
      if(userRef.current?.id===next?.id)return;
      generation.current++;userRef.current=next;setUser(next);stateRef.current=null;setState(null);
      metadata.current=[];readPending.current.clear();setActiveConversationId(null);setNewChatDialogOpen(false);
      setStatus(next?'loading':'unauthenticated');
    };
    let sawAuthEvent=false;
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{
      sawAuthEvent=true;accept(session?.user||null);
      if(!session)setStatus('unauthenticated');
    });
    void client.auth.getUser().then(({data,error:authError})=>{
      if(!mounted||sawAuthEvent)return;
      if(authError&&authError.name!=='AuthSessionMissingError'){report(authError);setStatus('error');return;}
      accept(data.user);if(!data.user)setStatus('unauthenticated');
    });
    return()=>{mounted=false;alive.current=false;generation.current++;subscription.unsubscribe();};
  },[configured,report]);
  useEffect(()=>{
    if(!user)return;
    let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;
    void cleanAbandonedUploads(user.id).catch(cause=>{if(!cancelled)report(cause);});
    const update=()=>{clearTimeout(timer);timer=setTimeout(()=>{void refreshState().catch(cause=>{if(!cancelled){report(cause);if(!stateRef.current)setStatus('error');}});},80);};
    // The subscription handshake also performs the initial read, closing the join/read gap.
    void refreshState().catch(cause=>{if(!cancelled){report(cause);setStatus('error');}});
    const unsubscribe=subscribeInbox(user.id,update);
    const onVisible=()=>{if(document.visibilityState==='visible')update();};
    document.addEventListener('visibilitychange',onVisible);
    window.addEventListener('online',update);
    return()=>{cancelled=true;clearTimeout(timer);unsubscribe();document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('online',update);};
  },[user,refreshState,report]);
  useEffect(()=>{if(state)document.documentElement.classList.toggle('dark',state.settings.theme==='dark');},[state?.settings.theme]);
  const userId=user?.id;
  useEffect(()=>{
    activeRef.current=activeConversationId;
    reconcileActive.current=null;
    const epoch=++activeEpoch.current;
    setHasOlder(false);setRealtimeStatus('CONNECTING');
    if(!activeConversationId||!userId){setLoadingMessages(false);return;}
    const id=activeConversationId;
    let cancelled=false;
    const valid=()=>!cancelled&&alive.current&&epoch===activeEpoch.current;
    const meta=()=>metadata.current.find(c=>c.id===id);
    let queue:Promise<unknown>=Promise.resolve();
    const enqueue=(work:()=>Promise<void>)=>{queue=queue.then(async()=>{if(valid())await work();}).catch(cause=>{if(valid())report(cause);});};
    setLoadingMessages(true);
    enqueue(async()=>{try{const page=await messagePage(id,userId,{metadata:meta()});if(valid()){replaceMessages(id,page.messages,true);setHasOlder(page.hasMore);}}finally{if(valid())setLoadingMessages(false);}});
    const reconcile=()=>enqueue(async()=>{
      const loaded=(stateRef.current?.conversations.find(c=>c.id===id)?.messages||[]).filter(message=>!isUnconfirmed(message));
      // Re-read only loaded IDs for edits/reactions; cursor-fetch any missed new messages.
      const refreshed:MessageType[]=[];
      for(let i=0;i<loaded.length;i+=PAGE_SIZE){refreshed.push(...await messagesById(loaded.slice(i,i+PAGE_SIZE).map(m=>m.id),id,userId,meta()));if(!valid())return;}
      const latest=loaded.at(-1);
      let after=latest?cursorOf(latest):undefined,more=true;
      const newMessages:MessageType[]=[];
      // Bound catch-up after a long absence; older history remains available by cursor.
      for(let batch=0;more&&batch<5;batch++){const page=await messagePage(id,userId,{after,metadata:meta()});if(!valid())return;if(!after)setHasOlder(page.hasMore);newMessages.push(...page.messages);more=Boolean(after)&&page.hasMore;if(!page.messages.length)break;after=cursorOf(page.messages.at(-1)!);}
      if(more){const latestPage=await messagePage(id,userId,{metadata:meta()});if(valid()){replaceMessages(id,latestPage.messages,true);setHasOlder(latestPage.hasMore);}return;}
      if(valid())replaceMessages(id,mergeMessages(refreshed,newMessages),true);
    });
    const unsubscribe=subscribeConversation(id,{
      status:value=>{if(valid())setRealtimeStatus(value);},reconcile,
      message:(messageId,deleted)=>enqueue(async()=>{
        if(deleted){const current=stateRef.current?.conversations.find(c=>c.id===id)?.messages||[];replaceMessages(id,current.filter(m=>m.id!==messageId),true);return;}
        const messages=await messagesById([messageId],id,userId,meta());if(valid())replaceMessages(id,messages);
      }),
    });
    reconcileActive.current=reconcile;
    const onVisible=()=>{if(document.visibilityState==='visible')reconcile();};
    window.addEventListener('online',reconcile);document.addEventListener('visibilitychange',onVisible);
    return()=>{cancelled=true;reconcileActive.current=null;unsubscribe();window.removeEventListener('online',reconcile);document.removeEventListener('visibilitychange',onVisible);};
  },[activeConversationId,userId,historyVersion,replaceMessages,report]);
  const loadOlder=useCallback(async()=>{
    const id=activeRef.current,current=userRef.current,epoch=activeEpoch.current;
    if(!id||!current||loadingMessages||!hasOlder)return false;
    const first=stateRef.current?.conversations.find(c=>c.id===id)?.messages.find(message=>!isUnconfirmed(message));if(!first)return false;
    setLoadingMessages(true);
    const result=await run(async()=>{try{const page=await messagePage(id,current.id,{before:cursorOf(first),metadata:metadata.current.find(c=>c.id===id)});if(epoch!==activeEpoch.current)return false;replaceMessages(id,page.messages);setHasOlder(page.hasMore);return true;}finally{if(epoch===activeEpoch.current)setLoadingMessages(false);}},false);
    return result??false;
  },[hasOlder,loadingMessages,replaceMessages,run]);
  const markConversationAsRead=useCallback(async(id:string)=>{
    const conv=stateRef.current?.conversations.find(c=>c.id===id),last=conv?.messages.filter(message=>!isUnconfirmed(message)).at(-1);
    if(!last||readPending.current.get(id)===last.id)return true;
    readPending.current.set(id,last.id);
    const result=await run(async()=>{check(await getSupabase().rpc('mark_conversation_read',{target_conversation:id,read_message_id:last.id}));await refreshState();return true;},false);
    if(!result)readPending.current.delete(id);return result??false;
  },[refreshState,run]);
  const mutation=useCallback(async(work:()=>Promise<unknown>)=>(await run(async()=>{await work();await refreshState();return true;}))??false,[refreshState,run]);
  const authenticate=useCallback(async(mode:'login'|'register',credentials:{email:string;password:string;displayName:string})=>{
    setError(null);setNotice(null);
    return (await run(async()=>{
      const auth=getSupabase().auth;
      if(mode==='login'){const result=await auth.signInWithPassword({email:credentials.email,password:credentials.password});if(result.error)throw result.error;}
      else{const data=check(await auth.signUp({email:credentials.email,password:credentials.password,options:{data:{display_name:credentials.displayName},emailRedirectTo:`${appOrigin(window.location.origin)}/auth/callback`}}));if(!data.session)setNotice('Check your email to confirm your account, then sign in.');}
      return true;
    }))??false;
  },[run]);
  const dismissError=useCallback(()=>setError(null),[]);
  if(!configured)return <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center"><h1 className="text-xl font-semibold">Connect your ChatFlow workspace</h1><p>Supabase configuration is required. Set the project URL and publishable key on the server, then restart the app.</p></main>;
  if(status==='loading'||status==='error')return <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-8 text-center">{status==='loading'?<p role="status">Connecting to your workspace…</p>:<><p role="alert">{error||'Unable to load your workspace.'}</p><Button disabled={pendingCount>0} onClick={()=>userRef.current?refresh():window.location.reload()}>Retry connection</Button></>}</div>;
  if(!state)return <AuthScreen authenticate={authenticate} pending={pendingCount>0} error={error} notice={notice} dismissError={dismissError} resetPassword={async email=>(await run(async()=>{setError(null);check(await getSupabase().auth.resetPasswordForEmail(email,{redirectTo:`${appOrigin(window.location.origin)}/auth/callback?type=recovery`}));setNotice('If an account exists for this email, a password reset link will arrive shortly.');return true;}))??false}/>;
  return <ChatFlowContext.Provider value={{...state,activeConversationId,setActiveConversationId,newChatDialogOpen,setNewChatDialogOpen,pending:pendingCount>0,error,dismissError,refresh,hasOlder,loadingMessages,realtimeStatus,loadOlder,markConversationAsRead,
    sendMessage:async(id,content,attachments=[],clientId=crypto.randomUUID(),media)=>(await run(async()=>{
      const current=userRef.current;if(!current)return false;
      if(attachments.some(a=>!a.id))throw new Error('Attachment upload is incomplete. Please retry.');
      const epoch=generation.current,clearEpoch=clearGeneration.current;
      const valid=()=>alive.current&&epoch===generation.current&&clearEpoch===clearGeneration.current;
      const now=new Date();
      const optimistic:MessageType={id:`pending:${clientId}`,clientMessageId:clientId,senderId:current.id,senderName:stateRef.current?.settings.displayName||'You',content,attachments,media,createdAt:now.toISOString(),timestamp:now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),date:now.toLocaleDateString(),isSentByMe:true,status:'sending'};
      replaceMessages(id,[optimistic]);
      let row:MessageRow;
      try {
        row=check(await getSupabase().rpc('send_message',{target_conversation:id,message_content:content,client_id:clientId,attachment_ids:attachments.map(a=>a.id!),message_media:media||null,used_emojis:usedEmojis(content)})) as unknown as MessageRow;
      } catch(cause) {
        // A committed Realtime message can arrive before a lost/error RPC response.
        const confirmed=stateRef.current?.conversations.find(c=>c.id===id)?.messages.some(m=>m.senderId===current.id&&m.clientMessageId===clientId&&!isUnconfirmed(m));
        if(confirmed)return true;
        if(valid())replaceMessages(id,[{...optimistic,status:'failed'}]);
        throw cause;
      }
      // RPC success is authoritative. An unrelated hydration/sidebar failure must not turn it into a failed send.
      if(valid())replaceMessages(id,[{...optimistic,id:row.id,createdAt:row.created_at||optimistic.createdAt,status:'sent'}]);
      void messagesById([row.id],id,current.id,metadata.current.find(c=>c.id===id)).then(messages=>{if(valid())replaceMessages(id,messages);}).catch(()=>{if(valid())report(new Error('Message sent. Some details could not be refreshed; reconnect to sync them.'));});
      return true;
    }))??false,
    addReaction:async(id,messageId,emoji)=>(await run(async()=>{
      const current=userRef.current;if(!current)return false;
      const epoch=generation.current,clearEpoch=clearGeneration.current;
      const valid=()=>alive.current&&epoch===generation.current&&clearEpoch===clearGeneration.current;
      const reacted=stateRef.current?.conversations.find(c=>c.id===id)?.messages.find(m=>m.id===messageId)?.reactions?.find(r=>r.emoji===emoji)?.reactedByMe;
      check(await getSupabase().rpc('set_reaction',{target_message:messageId,reaction_emoji:emoji,active:!reacted}));
      if(!valid())return true;
      const messages=await messagesById([messageId],id,current.id,metadata.current.find(c=>c.id===id));
      if(valid())replaceMessages(id,messages);return true;
    }))??false,
    startDirectChat:id=>run(async()=>{const conversationId=check(await getSupabase().rpc('get_or_create_direct_conversation',{other_user_id:id}));await refreshState();setActiveConversationId(conversationId);return conversationId;}),
    openChannelChat:id=>run(async()=>{if(!stateRef.current?.channels.find(c=>c.id===id)?.isJoined)check(await getSupabase().rpc('set_channel_membership',{target_conversation:id,joined:true}));await refreshState();setActiveConversationId(id);return id;}),
    toggleJoinChannel:id=>mutation(async()=>check(await getSupabase().rpc('set_channel_membership',{target_conversation:id,joined:!stateRef.current?.channels.find(c=>c.id===id)?.isJoined}))),
    createChannel:channel=>run(async()=>{const id=check(await getSupabase().rpc('create_channel',{channel_name:channel.name,channel_description:channel.description,channel_category:channel.category,private_channel:channel.isPrivate}));await refreshState();return stateRef.current?.channels.find(c=>c.id===id)||null;}),
    setConversationMuted:(id,muted)=>mutation(async()=>check(await getSupabase().rpc('set_conversation_muted',{target_conversation:id,muted_value:muted}))),
    inviteMember:(id,contactId)=>mutation(async()=>check(await getSupabase().rpc('invite_channel_member',{target_conversation:id,target_user:contactId}))),
    updateSettings:settings=>mutation(async()=>{const values={...settings};if(values.avatar?.startsWith('data:'))values.avatar=await uploadAvatar(values.avatar,userRef.current!.id);await saveSettings(values);}),
    unblockUser:id=>mutation(async()=>check(await getSupabase().rpc('set_blocked',{target_user:id,blocked:false}))),
    clearAllChatHistory:()=>mutation(async()=>{check(await getSupabase().rpc('clear_my_history'));activeEpoch.current++;clearGeneration.current++;const current=stateRef.current;if(current)apply({...current,conversations:current.conversations.map(c=>({...c,messages:[]}))});setHasOlder(false);readPending.current.clear();setHistoryVersion(value=>value+1);}),
    logout:async()=>(await run(async()=>{const result=await getSupabase().auth.signOut();if(result.error)throw result.error;return true;}))??false,
    deleteAccount:async()=>(await run(async()=>{await api('/account','DELETE');await getSupabase().auth.signOut({scope:'local'});return true;}))??false,
    uploadFile:(file,id)=>run(async()=>{const conversationId=id||activeRef.current;if(!conversationId)throw new Error('Open a conversation before uploading.');return uploadAttachment(file,conversationId);}),
    discardUpload:id=>run(async()=>{await discardAttachment(id);return true;}).then(value=>value??false),
  }}>{children}{error&&<div role="alert" className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] w-[min(92vw,640px)] rounded-xl border border-destructive/40 bg-card p-4 shadow-lg text-sm"><p>{error}</p><p className="mt-1 text-xs text-muted-foreground">You can retry the action. Unsaved changes are kept.</p><div className="flex gap-2 mt-3"><Button size="sm" variant="outline" disabled={pendingCount>0} onClick={refresh}>Refresh workspace</Button><Button size="sm" variant="ghost" onClick={dismissError}>Dismiss error</Button></div></div>}</ChatFlowContext.Provider>;
}
export function useChatFlow(){const context=useContext(ChatFlowContext);if(!context)throw new Error('useChatFlow must be used within a ChatFlowProvider');return context;}
