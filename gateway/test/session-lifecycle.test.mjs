import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture,provider,A,B,ROOM,pause } from './helpers.mjs';
test('HELLO deadline, auth failure and protocol incompatibility close socket',async t=>{
  const f=await fixture(t,{helloTimeoutMs:60}),anonymous=await f.client();await pause(100);assert.equal(anonymous.closed,true);
  const bad=await f.client();bad.send({type:'HELLO',version:'1.0',userId:A,displayName:'User',token:A});assert.equal((await bad.wait('ERROR')).code,'PROTOCOL_VERSION');
  const invalid=await f.client();invalid.send({type:'HELLO',version:'2.0',userId:A,displayName:'User',token:'bad'});assert.equal((await invalid.wait('ERROR')).code,'AUTH_FAILED');
});
test('verified subject binds identity; same-subject reauth extends expiry, different subject rejected',async t=>{
  const auth=provider();let expiry=Date.now()+400;auth.authenticate=async token=>({userId:token,expiresAt:expiry});
  const f=await fixture(t,{authorizer:auth}),c=await f.client();c.send({type:'HELLO',version:'2.0',userId:B,displayName:'spoof',token:A});assert.equal((await c.wait('WELCOME')).userId,A);
  expiry=Date.now()+1500;c.send({type:'HELLO',version:'2.0',userId:A,displayName:'user',token:A});assert.equal((await c.wait('WELCOME')).expiresAt,expiry);
  await pause(450);await c.join();assert.equal(c.closed,false);
  c.send({type:'HELLO',version:'2.0',userId:B,displayName:'user',token:B});assert.equal((await c.wait('ERROR')).code,'AUTH_FAILED');await pause();assert.equal(c.closed,true);
});
test('expiry removes room rights even when heartbeats continue',async t=>{
  // Keep credentials valid during setup regardless of CPU load, then advance
  // logical time. Production's expiry timer must still close the live socket.
  let now=Date.now();
  const auth=provider();auth.authenticate=async token=>({userId:token,expiresAt:now+100});
  const f=await fixture(t,{authorizer:auth,now:()=>now}),c=await f.client(A);await c.join();c.send({type:'PING'});await c.wait('PONG');
  now+=101;
  const deadline=Date.now()+2000;while(!c.closed&&Date.now()<deadline)await pause(5);
  assert.equal(c.closed,true);
});
test('bounded provider deadline and packet queue prevent a hung peer from blocking healthy sockets',async t=>{
  const auth=provider();const authenticate=auth.authenticate.bind(auth);auth.authenticate=token=>token===B?new Promise(()=>{}):authenticate(token);
  const f=await fixture(t,{authorizer:auth,authorizationTimeoutMs:40}),hung=await f.client(),good=await f.client(A);
  hung.send({type:'HELLO',version:'2.0',userId:B,displayName:'User',token:B});assert.equal((await hung.wait('ERROR')).code,'AUTH_FAILED');await good.join();
  const queued=await f.client(A);auth.isMember=async()=>{await pause(100);return true;};
  for(let i=0;i<70;i++)queued.send({type:'JOIN_ROOM',roomId:ROOM});assert.equal((await queued.wait('ERROR',p=>p.code==='QUEUE_LIMIT')).code,'QUEUE_LIMIT');
  good.send({type:'PING'});await good.wait('PONG');
});
