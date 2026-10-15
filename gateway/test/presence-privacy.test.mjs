import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture,A,B,pause,ROOM } from './helpers.mjs';
test('anonymous/blocked recipients receive no presence; unblock and provider outage enforced at delivery',async t=>{
  const f=await fixture(t),anonymous=await f.client(),a=await f.client(A),b=await f.client(B);await pause();a.packets.length=0;b.packets.length=0;
  f.auth.blocked.add([A,B].sort().join(':'));a.send({type:'PRESENCE',userId:B,status:'away'});await a.wait('PRESENCE',p=>p.userId===A&&p.status==='away');await pause();assert.equal(b.packets.some(p=>p.type==='PRESENCE'),false);assert.equal(anonymous.packets.length,0);
  f.auth.blocked.clear();a.send({type:'PRESENCE',userId:A,status:'online'});assert.equal((await b.wait('PRESENCE')).userId,A);
  f.auth.unavailable=true;b.packets.length=0;a.send({type:'PRESENCE',userId:A,status:'away'});await pause();assert.equal(b.packets.length,0);
});
test('typing verifies membership and filters blocked peers',async t=>{
  const f=await fixture(t),a=await f.client(A),b=await f.client(B);await a.join();await b.join();b.packets.length=0;
  f.auth.blocked.add([A,B].sort().join(':'));a.send({type:'TYPING',roomId:ROOM,userId:B,isTyping:true});await pause();assert.equal(b.packets.some(p=>p.type==='TYPING'),false);
  f.auth.blocked.clear();a.send({type:'TYPING',roomId:ROOM,userId:B,isTyping:true});assert.equal((await b.wait('TYPING')).userId,A);
  f.auth.members.delete(A);a.send({type:'TYPING',roomId:ROOM,userId:A,isTyping:true});await pause();assert.equal(b.packets.some(p=>p.type==='TYPING'),false);
});
