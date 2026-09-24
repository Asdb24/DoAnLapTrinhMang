import { getSupabase } from '@/lib/supabase/client';

export function subscribeInbox(userId:string,changed:()=>void) {
  const client=getSupabase();
  const channel=client.channel(`user:${userId}`,{config:{private:true}})
    .on('broadcast',{event:'conversation_changed'},changed)
    .subscribe(status=>{if(status==='SUBSCRIBED')changed();});
  return ()=>{void client.removeChannel(channel);};
}
export function subscribeConversation(id:string,handlers:{message:(id:string,deleted:boolean)=>void;reconcile:()=>void;status:(value:string)=>void}) {
  const client=getSupabase();
  const channel=client.channel(`conversation:${id}`,{config:{private:true}})
    .on('system',{},payload=>{if(payload.extension==='postgres_changes'&&payload.status==='ok'){handlers.status('SUBSCRIBED');handlers.reconcile();}})
    .on('postgres_changes',{event:'*',schema:'public',table:'messages',filter:`conversation_id=eq.${id}`},payload=>{
      const row=payload.eventType==='DELETE'?payload.old:payload.new;
      if(typeof row.id==='string')handlers.message(row.id,payload.eventType==='DELETE');
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'attachments',filter:`conversation_id=eq.${id}`},payload=>{const row=payload.eventType==='DELETE'?payload.old:payload.new;if(typeof row.message_id==='string')handlers.message(row.message_id,false);})
    .on('broadcast',{event:'reaction_changed'},payload=>{if(typeof payload.payload?.message_id==='string')handlers.message(payload.payload.message_id,false);})
    .subscribe(status=>{if(status!=='SUBSCRIBED')handlers.status(status);if(status==='SUBSCRIBED')handlers.reconcile();});
  return ()=>{void client.removeChannel(channel);};
}
