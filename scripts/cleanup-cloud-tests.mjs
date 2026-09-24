import {createClient} from '@supabase/supabase-js';
import {loadEnvFile} from 'node:process';
import {readFileSync,unlinkSync} from 'node:fs';
loadEnvFile('.env.local');
const fixture=JSON.parse(readFileSync('.env.cloud-test.local','utf8'));
if(fixture.project!==process.env.NEXT_PUBLIC_SUPABASE_URL||!fixture.accounts?.every(account=>/^chatflow-test-(a|b|outside)-[0-9a-f-]+@example\.com$/.test(account.email)))throw new Error('Refusing to clean unrelated accounts or project.');
const client=createClient(fixture.project,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const must=result=>{if(result.error)throw new Error(result.error.message);return result.data;};
for(const account of fixture.accounts){
  const actual=must(await client.auth.admin.getUserById(account.id)).user;
  if(actual.email!==account.email)throw new Error('Fixture identity mismatch.');
  const files=must(await client.from('attachments').select('storage_path').eq('uploader_id',account.id));
  if(files.length)must(await client.storage.from('chat-attachments').remove(files.map(file=>file.storage_path)));
  for(;;){const avatars=must(await client.storage.from('profile-avatars').list(account.id,{limit:100}));if(!avatars.length)break;must(await client.storage.from('profile-avatars').remove(avatars.map(file=>`${account.id}/${file.name}`)));}
}
must(await client.from('conversations').delete().eq('id',fixture.conversationId));
for(const account of fixture.accounts)must(await client.auth.admin.deleteUser(account.id));
unlinkSync('.env.cloud-test.local');
console.log('Removed only the retained Cloud test accounts, conversation, and files.');
