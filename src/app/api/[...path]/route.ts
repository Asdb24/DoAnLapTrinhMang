import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { serverClient } from '@/lib/supabase/server';
import { requireSupabaseConfig } from '@/lib/supabase/config';
import { appOrigin } from '@/lib/public-url.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{path:string[]}>};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json=(error:string,status:number)=>NextResponse.json({error},{status,headers:{'Cache-Control':'private, no-store'}});
async function handler(request:Request,context:Context) {
  const path=(await context.params).path;
  if(request.method==='GET'&&path.join('/')==='health')return NextResponse.json({ok:true,backend:'supabase'});
  try{
    const client=await serverClient();
    const {data:{user},error}=await client.auth.getUser();
    if(error||!user)return json('Sign in to continue.',401);
    if(request.method==='GET'&&path.length===2&&uuid.test(path[1])&&['attachments','avatars'].includes(path[0])){
      let bucket:string,storagePath:string,name='avatar',mime='application/octet-stream';
      if(path[0]==='attachments'){
        const result=await client.from('attachments').select('*').eq('id',path[1]).maybeSingle();
        if(result.error||!result.data)return json('File unavailable.',404);
        bucket='chat-attachments';storagePath=result.data.storage_path;name=result.data.file_name;mime=result.data.mime_type;
      }else{
        const result=await client.from('profiles').select('avatar_url').eq('id',path[1]).maybeSingle();
        if(result.error||!result.data?.avatar_url.startsWith(`avatar:${path[1]}/`))return json('Avatar unavailable.',404);
        bucket='profile-avatars';storagePath=result.data.avatar_url.slice(7);
      }
      // User JWT and Storage RLS are checked on every request; never use the admin client here.
      const result=await client.storage.from(bucket).download(storagePath);
      if(result.error||!result.data)return json('File unavailable.',404);
      if(path[0]==='avatars')mime=result.data.type;
      const inline=['image/png','image/jpeg','image/webp','image/gif'].includes(mime);
      const encoded=encodeURIComponent(name).replace(/['()]/g,char=>`%${char.charCodeAt(0).toString(16)}`);
      return new Response(result.data,{headers:{'Content-Type':mime,'Content-Disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${encoded}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
    }
    if(request.method==='DELETE'&&path.join('/')==='account'){
      const origin=request.headers.get('origin');
      if(!origin||origin!==appOrigin(new URL(request.url).origin))return json('Invalid request origin.',403);
      const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
      if(!secret)return json('Account deletion is not configured. Contact your workspace administrator.',503);
      const admin=createClient(requireSupabaseConfig().url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
      const attachments=await admin.from('attachments').select('storage_path').eq('uploader_id',user.id);
      if(attachments.error)throw attachments.error;
      const paths=(attachments.data||[]).map(row=>row.storage_path);
      for(let i=0;i<paths.length;i+=100){const result=await admin.storage.from('chat-attachments').remove(paths.slice(i,i+100));if(result.error)throw result.error;}
      // Always list from offset zero as each batch is removed.
      for(;;){const result=await admin.storage.from('profile-avatars').list(user.id,{limit:100});if(result.error)throw result.error;if(!result.data.length)break;const removal=await admin.storage.from('profile-avatars').remove(result.data.map(file=>`${user.id}/${file.name}`));if(removal.error)throw removal.error;}
      const result=await admin.auth.admin.deleteUser(user.id);
      if(result.error)throw result.error;
      await client.auth.signOut({scope:'local'});
      return NextResponse.json({ok:true});
    }
    return json('Endpoint unavailable. ChatFlow now uses Supabase.',404);
  }catch{ return json('The service is unavailable. Please retry.',503); }
}
export {handler as GET,handler as POST,handler as PUT,handler as PATCH,handler as DELETE};
