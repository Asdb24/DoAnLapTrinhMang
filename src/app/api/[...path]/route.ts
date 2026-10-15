import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { serverClient } from '@/lib/supabase/server';
import { requireSupabaseConfig } from '@/lib/supabase/config';
import { appOrigin } from '@/lib/public-url.mjs';
import { deleteAccountStorageAndIdentity, discardClaimedAttachment, handleAccountDeletion, handleAttachmentDiscard, type AccountDeletionDependencies } from '@/lib/account-deletion';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{path:string[]}>};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json=(error:string,status:number)=>NextResponse.json({error},{status,headers:{'Cache-Control':'private, no-store'}});
async function handler(request:Request,context:Context) {
  const path=(await context.params).path;
  if(request.method==='GET'&&path.join('/')==='health')return NextResponse.json({ok:true,backend:'supabase'});
  try{
    const deletingAccount=request.method==='DELETE'&&path.join('/')==='account';
    const discardingAttachment=request.method==='POST'&&path.length===3&&path[0]==='attachments'&&uuid.test(path[1])&&path[2]==='discard';
    if(deletingAccount||discardingAttachment){
      const dependencies: AccountDeletionDependencies = {
        env: process.env,
        hostedAvailable: Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
        canonicalOrigin: () => appOrigin(new URL(request.url).origin),
        async cookieIdentity(needToken) {
          const client = await serverClient();
          const {data:{user},error} = await client.auth.getUser();
          if(error || !user || !(user.email_confirmed_at || user.phone_confirmed_at)) return null;
          const session = needToken ? await client.auth.getSession() : null;
          if(session?.error) return null;
          return { id:user.id, accessToken:session?.data.session?.access_token,
            async signOut() { const result=await client.auth.signOut({scope:'local'}); if(result.error) throw result.error; } };
        },
        async verifyBearer(token) {
          const {url,key}=requireSupabaseConfig();
          const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
          const {data:{user},error}=await client.auth.getUser(token);
          return error || !user || !(user.email_confirmed_at || user.phone_confirmed_at) ? null : {id:user.id};
        },
        async deleteIdentity(userId) {
          const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
          if(!secret) throw new Error('Account deletion unavailable');
          const admin=createClient(requireSupabaseConfig().url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
          await deleteAccountStorageAndIdentity(admin,userId);
        },
        async discardAttachment(attachmentId,userId,token) {
          const {url,key}=requireSupabaseConfig();
          const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
          if(!secret) throw new Error('File cleanup unavailable');
          const userClient=token ? createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}}) : await serverClient();
          const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
          await discardClaimedAttachment(userClient,admin,attachmentId,userId);
        },
        fetch,
      };
      return deletingAccount ? handleAccountDeletion(request,dependencies) : handleAttachmentDiscard(request,path[1],dependencies);
    }
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
    return json('Endpoint unavailable. ChatFlow now uses Supabase.',404);
  }catch{ return json('The service is unavailable. Please retry.',503); }
}
export {handler as GET,handler as POST,handler as PUT,handler as PATCH,handler as DELETE};
