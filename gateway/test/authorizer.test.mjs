import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseAuthorizer } from '../dist/supabase-authorizer.js';
import { createTestJwt,A,ROOM,MSG } from './helpers.mjs';
test('provider uses explicit public key plus caller bearer for Auth/RLS/RPC; never service role',async()=>{
  const token=createTestJwt({sub:A},'fixture'),requests=[];
  const fetcher=async(url,options)=>{requests.push({url,options});let value;if(url.endsWith('/auth/v1/user'))value={id:A};else if(url.includes('conversation_members'))value=[{user_id:A}];else if(url.includes('/messages?'))value=[{id:MSG}];else value=true;return new Response(JSON.stringify(value),{status:200});};
  const provider=new SupabaseAuthorizer('https://test.supabase.co','sb_publishable_fixture',100,fetcher),identity=await provider.authenticate(token),session={...identity,token,sessionId:A};
  assert.equal(await provider.isMember(session,ROOM),true);assert.equal((await provider.message(session,MSG)).id,MSG);assert.equal(await provider.canObservePresence(session,A),true);
  for(const request of requests){assert.equal(request.options.headers.apikey,'sb_publishable_fixture');assert.equal(request.options.headers.Authorization,'Bearer '+token);assert.ok(request.options.signal);}
  assert.deepEqual(JSON.parse(requests[3].options.body),{target_user:A});assert.match(requests[1].url,/user_id=eq\./);
  assert.throws(()=>new SupabaseAuthorizer('https://test.supabase.co','sb_secret_fixture'));assert.throws(()=>new SupabaseAuthorizer('http://remote.example','public'));assert.throws(()=>new SupabaseAuthorizer('https://test.supabase.co',createTestJwt({sub:A,role:'service_role'},'fixture')));
});
test('provider rejects expired/missing expiry, wrong verified subject, empty membership and outages',async()=>{
  let result={id:A};const fetcher=async()=>new Response(JSON.stringify(result),{status:200});const provider=new SupabaseAuthorizer('https://test.supabase.co','sb_publishable_fixture',100,fetcher);
  for(const token of [createTestJwt({sub:A,exp:0},'fixture'),createTestJwt({sub:ROOM},'fixture'),'bad'])await assert.rejects(()=>provider.authenticate(token));
  result=[];assert.equal(await provider.isMember({token:'token',userId:A},ROOM),false);
  const unavailable=new SupabaseAuthorizer('https://test.supabase.co','public',20,async()=>new Response('offline',{status:503}));await assert.rejects(()=>unavailable.isMember({token:'token',userId:A},ROOM));
});
