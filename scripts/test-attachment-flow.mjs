import { createClient } from '@supabase/supabase-js';
import { loadEnvFile } from 'node:process';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
loadEnvFile('.env.local');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const must = result => { if (result.error) throw new Error(result.error.message); return result.data; };
const accounts = [], paths = [], conversations = [];
let checks = 0;
try {
  for (let index = 0; index < 2; index++) {
    const email = `chatflow-attachment-test-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url');
    const { user } = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
    accounts.push({ id: user.id, email, password });
  }
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
  must(await client.auth.signInWithPassword(accounts[0]));
  const conversation = must(await client.rpc('get_or_create_direct_conversation', { other_user_id: accounts[1].id }));
  conversations.push(conversation);
  // File, not Uint8Array: exercises the same multipart upload path used by browser selections.
  for (const [name, type] of [['notes.txt', 'text/plain'], ['data.csv', 'text/csv'], ['report.pdf', 'application/pdf'], ['image.png', 'image/png'], ['slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']]) {
    const file = new File(['attachment regression fixture'], name, { type });
    const attachment = must(await client.rpc('reserve_attachment', { target_conversation: conversation, upload_id: randomUUID(), file_name: name, mime_type: type, file_size: file.size }));
    paths.push(attachment.storage_path);
    must(await client.storage.from('chat-attachments').upload(attachment.storage_path, file, { contentType: type, upsert: false }));
    const id = randomUUID();
    const payload = { target_conversation: conversation, message_content: '', client_id: id, attachment_ids: [attachment.id] };
    const sent = must(await client.rpc('send_message', payload));
    assert.equal(must(await client.rpc('send_message', payload)).id, sent.id);
    assert.equal(must(await client.from('attachments').select('message_id').eq('id', attachment.id).single()).message_id, sent.id);
    assert.equal(await must(await client.storage.from('chat-attachments').download(attachment.storage_path)).text(), await file.text());
    assert.equal(must(await client.rpc('claim_attachment_discard',{target_attachment:attachment.id})),null);
    checks++;
    console.log(`PASS browser File multipart upload, empty-text send, association, retry, download: ${name}`);
  }
  // Actual concurrent requests, plus Storage HTTP enforcement after the winner is known.
  for(let index=0;index<3;index++) {
    const file=new File(['race fixture'],'race.txt',{type:'text/plain'});
    const attachment=must(await client.rpc('reserve_attachment',{target_conversation:conversation,upload_id:randomUUID(),file_name:file.name,mime_type:file.type,file_size:file.size}));
    paths.push(attachment.storage_path);
    must(await client.storage.from('chat-attachments').upload(attachment.storage_path,file));
    const [sent,claimed]=await Promise.all([
      client.rpc('send_message',{target_conversation:conversation,message_content:'',client_id:randomUUID(),attachment_ids:[attachment.id]}),
      client.rpc('claim_attachment_discard',{target_attachment:attachment.id})
    ]);
    const claim=must(claimed);
    if(claim) {
      assert.ok(sent.error,'A claimed attachment cannot commit to a message');
      must(await client.storage.from('chat-attachments').remove([attachment.storage_path]));
      must(await client.rpc('discard_attachment',{target_attachment:attachment.id}));
      assert.ok((await client.storage.from('chat-attachments').download(attachment.storage_path)).error);
    } else {
      assert.ok(must(sent).id,'A committed message wins over cleanup');
      await client.storage.from('chat-attachments').remove([attachment.storage_path]);
      assert.equal(await must(await client.storage.from('chat-attachments').download(attachment.storage_path)).text(),'race fixture');
    }
    checks++;console.log('PASS concurrent send/discard preserves the authoritative winner and Storage policy');
  }
  // A departing non-owner retains cleanup authority without read access.
  const peer=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
  const peerSession=must(await peer.auth.signInWithPassword(accounts[1]));
  const channel=must(await client.rpc('create_channel',{channel_name:'Cleanup fixture',channel_description:'',channel_category:'General',private_channel:false}));
  conversations.push(channel);
  must(await peer.rpc('set_channel_membership',{target_conversation:channel,joined:true}));
  const draft=must(await peer.rpc('reserve_attachment',{target_conversation:channel,upload_id:randomUUID(),file_name:'left.txt',mime_type:'text/plain',file_size:3}));
  paths.push(draft.storage_path);must(await peer.storage.from('chat-attachments').upload(draft.storage_path,new File(['abc'],'left.txt',{type:'text/plain'})));
  must(await admin.from('attachments').update({created_at:new Date(Date.now()-25*3600000).toISOString()}).eq('id',draft.id));
  must(await peer.rpc('set_channel_membership',{target_conversation:channel,joined:false}));
  assert.ok((await peer.storage.from('chat-attachments').download(draft.storage_path)).error);
  assert.ok(must(await peer.rpc('list_cleanup_attachments')).some(row=>row.id===draft.id));
  assert.equal(must(await client.rpc('claim_attachment_discard',{target_attachment:draft.id})),null);
  assert.equal(must(await peer.rpc('claim_attachment_discard',{target_attachment:draft.id})).id,draft.id);
  if(process.env.TEST_APP_ORIGIN){
    const target=new URL(process.env.TEST_APP_ORIGIN);assert.equal(target.protocol,'https:');assert.equal(target.pathname,'/');
    const response=await fetch(`${target.origin}/api/attachments/${draft.id}/discard`,{method:'POST',headers:{Authorization:`Bearer ${peerSession.session.access_token}`},redirect:'error'});
    assert.equal(response.status,200,await response.text());
    assert.equal(must(await admin.from('attachments').select('id').eq('id',draft.id)).length,0);
    assert.ok((await admin.storage.from('chat-attachments').download(draft.storage_path)).error);
    console.log('PASS hosted claimed-draft cleanup after leave removes bytes and reservation');
  } else {
    console.log('UNVERIFIED hosted leave-cleanup endpoint: set explicit TEST_APP_ORIGIN for this staging check');
    must(await admin.storage.from('chat-attachments').remove([draft.storage_path]));
    must(await peer.rpc('discard_attachment',{target_attachment:draft.id}));
  }
  checks++;console.log('PASS departed uploader can list/claim cleanup without reading bytes; unrelated uploader cannot claim');
} finally {
  if (paths.length) must(await admin.storage.from('chat-attachments').remove(paths));
  for (const id of conversations) must(await admin.from('conversations').delete().eq('id', id));
  for (const { id } of accounts) must(await admin.auth.admin.deleteUser(id));
}
console.log(`Attachment flow passed: ${checks} file scenarios.`);
