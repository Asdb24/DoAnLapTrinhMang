import {createClient} from '@supabase/supabase-js';
import {loadEnvFile} from 'node:process';
import {randomUUID,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
loadEnvFile('.env.local');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin=createClient(url,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const origin=process.env.TEST_APP_ORIGIN||'http://localhost:3100';
const accountOrigin=process.env.TEST_ACCOUNT_REQUEST_ORIGIN||process.env.NEXT_PUBLIC_APP_URL||origin;
let userId;
const must=result=>{if(result.error)throw new Error(result.error.message);return result.data;};
try{
  // Generate a real signup token without sending email to a fictitious address.
  const email=`chatflow-confirm-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');
  const created=must(await admin.auth.admin.generateLink({type:'signup',email,password,options:{data:{display_name:'Confirmation test'}}}));userId=created.user.id;
  const visitor=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  assert.ok((await visitor.auth.signInWithPassword({email,password})).error,'Unconfirmed account must not sign in');
  console.log('PASS unconfirmed sign-in blocked');
  const callback=await fetch(`${origin}/auth/callback?token_hash=${encodeURIComponent(created.properties.hashed_token)}`,{redirect:'manual'});
  assert.equal(callback.status,307);assert.equal(new URL(callback.headers.get('location')).pathname,'/');
  let cookie=callback.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  assert.ok(cookie.includes('auth-token'),'Callback must set SSR session cookies');console.log('PASS real signup confirmation callback establishes session');
  must(await visitor.auth.signInWithPassword({email,password}));
  assert.equal(must(await visitor.from('profiles').select('display_name').eq('id',userId).single()).display_name,'Confirmation test');console.log('PASS confirmed account signs in and profile persists');
  const recovery=must(await admin.auth.admin.generateLink({type:'recovery',email}));
  const recovered=await fetch(`${origin}/auth/callback?type=recovery&token_hash=${encodeURIComponent(recovery.properties.hashed_token)}`,{redirect:'manual'});
  assert.equal(recovered.status,307);assert.equal(new URL(recovered.headers.get('location')).pathname,'/reset-password');
  assert.ok(recovered.headers.getSetCookie().some(value=>value.includes('auth-token')));console.log('PASS real recovery callback establishes session and routes to password form');
  const passwordPage=await fetch(`${origin}/reset-password`,{headers:{Cookie:recovered.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')}});
  assert.equal(passwordPage.status,200);console.log('PASS recovery password page serves with authenticated cookies');
  const replacement=randomBytes(24).toString('base64url');
  must(await visitor.auth.updateUser({password:replacement}));await visitor.auth.signOut();
  assert.ok((await visitor.auth.signInWithPassword({email,password})).error);
  must(await visitor.auth.signInWithPassword({email,password:replacement}));console.log('PASS changed password rejects previous password and accepts replacement');
  const fresh=must(await admin.auth.admin.generateLink({type:'magiclink',email}));
  const freshCallback=await fetch(`${origin}/auth/callback?token_hash=${encodeURIComponent(fresh.properties.hashed_token)}`,{redirect:'manual'});
  assert.equal(freshCallback.status,307);cookie=freshCallback.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  const denied=await fetch(`${origin}/api/account`,{method:'DELETE',headers:{Cookie:cookie,Origin:'https://untrusted.invalid'}});assert.equal(denied.status,403);console.log('PASS account deletion rejects wrong origin');
  // Explicit invalid bearer must not fall back to the valid cookie account.
  for(const authorization of ['Basic invalid','Bearer fixture-invalid-expired-token']){
    const invalid=await fetch(`${origin}/api/account`,{method:'DELETE',headers:{Cookie:cookie,Origin:accountOrigin,Authorization:authorization}});
    assert.equal(invalid.status,401);
  }
  console.log('PASS explicit invalid bearer cannot delete the cookie identity');
  // Optional staging desktop origin verifies signup/recovery cookies at its local
  // listener. No production redirect allowlist is broadened by this script.
  if(process.env.TEST_DESKTOP_APP_ORIGIN){
    const desktop=new URL(process.env.TEST_DESKTOP_APP_ORIGIN);
    assert.equal(desktop.protocol,'http:');assert.equal(desktop.hostname,'127.0.0.1');
    const desktopLink=must(await admin.auth.admin.generateLink({type:'magiclink',email}));
    const desktopCallback=await fetch(`${desktop.origin}/auth/callback?token_hash=${encodeURIComponent(desktopLink.properties.hashed_token)}`,{redirect:'manual'});
    assert.equal(desktopCallback.status,307);assert.equal(new URL(desktopCallback.headers.get('location')).origin,desktop.origin);
    const desktopCookie=desktopCallback.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');assert.ok(desktopCookie.includes('auth-token'));
    const desktopRecovery=must(await admin.auth.admin.generateLink({type:'recovery',email}));
    const desktopRecovered=await fetch(`${desktop.origin}/auth/callback?type=recovery&token_hash=${encodeURIComponent(desktopRecovery.properties.hashed_token)}`,{redirect:'manual'});
    assert.equal(desktopRecovered.status,307);assert.equal(new URL(desktopRecovered.headers.get('location')).origin,desktop.origin);assert.equal(new URL(desktopRecovered.headers.get('location')).pathname,'/reset-password');
    const foreign=await fetch(`${desktop.origin}/api/account`,{method:'DELETE',headers:{Cookie:desktopCookie,Origin:accountOrigin}});assert.equal(foreign.status,403);
    console.log('PASS staged desktop callbacks preserve local origin/session and reject hosted Origin');
  }
  const deleted=await fetch(`${origin}/api/account`,{method:'DELETE',headers:{Cookie:cookie,Origin:accountOrigin}});assert.equal(deleted.status,200,await deleted.text());console.log('PASS authenticated self-account deletion');
  userId=null;
}finally{if(userId)must(await admin.auth.admin.deleteUser(userId));}
