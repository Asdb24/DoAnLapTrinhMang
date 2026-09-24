import { getSupabase } from '@/lib/supabase/client';
import { check } from './workspace';
import type { AttachmentRow } from '@/types/database';
import type { MessageAttachment } from '@/types';
import { validateFile } from '@/lib/attachment-validation';
export { validateFile } from '@/lib/attachment-validation';

const imageTypes=new Set(['image/jpeg','image/png','image/webp','image/gif']);
export async function uploadAttachment(file:File,conversationId:string):Promise<MessageAttachment> {
  const mime=validateFile(file);
  const client=getSupabase();
  const row=check(await client.rpc('reserve_attachment',{target_conversation:conversationId,upload_id:crypto.randomUUID(),file_name:file.name,mime_type:mime,file_size:file.size})) as unknown as AttachmentRow;
  // Supabase multipart reads Blob.type; contentType alone does not override it.
  const body=file.type===mime?file:new File([file],file.name,{type:mime,lastModified:file.lastModified});
  const result=await client.storage.from('chat-attachments').upload(row.storage_path,body,{contentType:mime,upsert:false});
  if(result.error){
    try { await discardAttachment(row.id); }
    catch { throw new Error(`${result.error.message}. Cleanup could not finish; the abandoned upload will be retried on a later sign-in.`); }
    throw new Error(result.error.message);
  }
  return {id:row.id,name:file.name,size:`${(file.size/1024).toFixed(1)} KB`,type:imageTypes.has(mime)?'image':mime==='application/pdf'?'pdf':'doc',url:`/api/attachments/${row.id}`};
}
export async function discardAttachment(id:string) {
  const client=getSupabase();
  // The claim serializes against send_message before any irreversible byte deletion.
  const row=check(await client.rpc('claim_attachment_discard',{target_attachment:id})) as unknown as AttachmentRow|null;
  if(!row)return;
  check(await client.storage.from('chat-attachments').remove([row.storage_path]));
  check(await client.rpc('discard_attachment',{target_attachment:id}));
}
/** Recover abandoned drafts from a previous closed tab, scoped to this authenticated owner. */
export async function cleanAbandonedUploads(userId:string) {
  const cutoff=new Date(Date.now()-24*60*60*1000).toISOString();
  const rows=check(await getSupabase().from('attachments').select('id').eq('uploader_id',userId).is('message_id',null).lt('created_at',cutoff).limit(20));
  for(const row of rows)await discardAttachment(row.id);
}
export async function uploadAvatar(dataUrl:string,userId:string) {
  const blob=await (await fetch(dataUrl)).blob();
  if(!imageTypes.has(blob.type)||blob.size>2*1024*1024)throw new Error('Choose a PNG, JPEG, WebP or GIF avatar up to 2 MB.');
  const path=`${userId}/${crypto.randomUUID()}`;
  check(await getSupabase().storage.from('profile-avatars').upload(path,blob,{contentType:blob.type,upsert:false}));
  return `avatar:${path}`;
}
