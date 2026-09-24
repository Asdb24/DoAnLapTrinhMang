import { getSupabase } from '@/lib/supabase/client';
import { avatarUrl, check } from './workspace';
import type { ConversationMetadata, Database } from '@/types/database';
type MessageRow=Database['public']['Tables']['messages']['Row'];
import type { MessageType } from '@/types';
import type { ChatMedia } from '@/types/media';

export const PAGE_SIZE=40;
export type Cursor={createdAt:string;id:string};
export const cursorOf=(message:MessageType):Cursor=>({createdAt:message.createdAt!,id:message.id});
function cursorFilter(cursor:Cursor,operator:'lt'|'gt') {
  if(!/^[0-9a-f-]{36}$/i.test(cursor.id)||!/^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)$/.test(cursor.createdAt)) throw new Error('Invalid message cursor');
  return `created_at.${operator}.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.${operator}.${cursor.id})`;
}
export function mergeMessages(existing:MessageType[],incoming:MessageType[]) {
  const items=new Map(existing.map(item=>[item.id,item]));
  for(const item of incoming) {
    const sameRequest=item.clientMessageId ? [...items.values()].find(other=>other.senderId===item.senderId&&other.clientMessageId===item.clientMessageId) : undefined;
    if(sameRequest&&sameRequest.id!==item.id){
      if(!isUnconfirmed(sameRequest)&&isUnconfirmed(item))continue;
      items.delete(sameRequest.id);
    }
    items.set(item.id,item);
  }
  return [...items.values()].sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||'')||a.id.localeCompare(b.id));
}
export const isUnconfirmed=(message:MessageType)=>message.status==='sending'||message.status==='failed';
async function hydrate(rows:MessageRow[],userId:string,metadata?:ConversationMetadata):Promise<MessageType[]> {
  if(!rows.length)return [];
  const client=getSupabase(),ids=rows.map(row=>row.id);
  const [attachments,reactions,profiles]=await Promise.all([
    client.from('attachments').select('*').in('message_id',ids),client.from('message_reactions').select('*').in('message_id',ids),
    client.from('profiles').select('*').in('id',[...new Set(rows.flatMap(row=>row.sender_id?[row.sender_id]:[]))]),
  ]);
  const files=check(attachments),reacts=check(reactions),people=check(profiles);
  return rows.map(row=>{
    const sender=people.find(p=>p.id===row.sender_id),grouped=new Map<string,{emoji:string;count:number;reactedByMe:boolean}>();
    for(const reaction of reacts.filter(r=>r.message_id===row.id)){const item=grouped.get(reaction.emoji)||{emoji:reaction.emoji,count:0,reactedByMe:false};item.count++;item.reactedByMe ||= reaction.user_id===userId;grouped.set(item.emoji,item);}
    const isSentByMe=row.sender_id===userId;
    const read=metadata?.members.some(member=>member.user_id!==userId && member.last_read_at && (member.last_read_at>row.created_at || member.last_read_at===row.created_at && (member.last_read_message_id||'')>=row.id));
    return {id:row.id,createdAt:row.created_at,clientMessageId:row.client_message_id,senderId:row.sender_id||'',senderName:sender?.display_name||'Deleted user',senderAvatar:avatarUrl(sender?.avatar_url||''),content:row.deleted_at?'Message deleted':row.content,media:row.deleted_at?null:row.media as ChatMedia|null,
      timestamp:new Date(row.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),date:new Date(row.created_at).toLocaleDateString(),isSentByMe,status:isSentByMe?(read?'read':'sent'):'read',
      reactions:row.deleted_at?[]:[...grouped.values()],attachments:row.deleted_at?[]:files.filter(file=>file.message_id===row.id).map(file=>({id:file.id,name:file.file_name,size:`${(file.file_size/1024).toFixed(1)} KB`,type:file.mime_type.startsWith('image/')?'image':file.mime_type==='application/pdf'?'pdf':'doc',url:`/api/attachments/${file.id}`}))};
  });
}
export async function messagePage(conversationId:string,userId:string,options:{before?:Cursor;after?:Cursor;metadata?:ConversationMetadata}={}) {
  let query=getSupabase().from('messages').select('*').eq('conversation_id',conversationId);
  if(options.before)query=query.or(cursorFilter(options.before,'lt'));
  if(options.after)query=query.or(cursorFilter(options.after,'gt'));
  const ascending=Boolean(options.after);
  const rows=check(await query.order('created_at',{ascending}).order('id',{ascending}).limit(PAGE_SIZE));
  return {messages:await hydrate(ascending?rows:[...rows].reverse(),userId,options.metadata),hasMore:rows.length===PAGE_SIZE};
}
export async function messagesById(ids:string[],conversationId:string,userId:string,metadata?:ConversationMetadata) {
  if(!ids.length)return [];
  const rows=check(await getSupabase().from('messages').select('*').eq('conversation_id',conversationId).in('id',ids));
  return hydrate(rows,userId,metadata);
}
