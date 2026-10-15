import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture,A,B,C,ROOM,OTHER,MSG,pause } from './helpers.mjs';
import { ChatFlowGateway } from '../dist/server.js';
test('startup requires configured RLS authorization; no implicit anonymous mode',()=>{
  assert.throws(()=>new ChatFlowGateway({port:0,uploadDir:'unused'}),/provider/);
});
test('invalid shapes and asynchronous provider errors are contained; valid peer continues',async t=>{
  const f=await fixture(t),a=await f.client(A),b=await f.client(B);await a.join();await b.join();
  for(const packet of [null,[],{type:'SEND_MSG',roomId:ROOM,clientMsgId:'request',serverMsgId:MSG,content:'forged'},{type:'FILE_START',roomId:ROOM,fileName:null},{type:'WELCOME'}]){a.send(packet);assert.equal((await a.wait('ERROR')).code,'INVALID_PACKET');}
  a.ws.send('{');assert.equal((await a.wait('ERROR')).code,'INVALID_PACKET');
  f.auth.unavailable=true;a.send({type:'JOIN_ROOM',roomId:OTHER});assert.equal((await a.wait('ERROR')).code,'REQUEST_FAILED');f.auth.unavailable=false;
  b.send({type:'PING'});assert.equal((await b.wait('PONG')).type,'PONG');
  a.send({type:'JOIN_ROOM',roomId:ROOM});assert.equal((await a.wait('ROOM_ACK')).status,'joined');
});
test('room join/operation/delivery recheck current membership and fail closed',async t=>{
  const f=await fixture(t),a=await f.client(A),b=await f.client(B),c=await f.client(C);await a.join();await b.join();
  c.send({type:'JOIN_ROOM',roomId:ROOM});assert.equal((await c.wait('ERROR')).code,'FORBIDDEN');
  f.auth.members.delete(B);f.auth.messages.set(MSG,{id:MSG,client_message_id:'req',conversation_id:ROOM,sender_id:A,created_at:'2026-10-14T00:00:00Z',edited_at:null,deleted_at:null});
  a.send({type:'SEND_MSG',roomId:ROOM,clientMsgId:'req',serverMsgId:MSG});await a.wait('MSG_ACK');await a.wait('MESSAGE_CHANGED');await pause();assert.equal(b.packets.some(p=>p.type==='MESSAGE_CHANGED'),false);
  b.send({type:'DELETE_MSG',roomId:ROOM,messageId:MSG});assert.equal((await b.wait('ERROR')).code,'FORBIDDEN');
});
test('oversized text closes only offending connection',async t=>{
  const f=await fixture(t),bad=await f.client(A),good=await f.client(B);
  bad.ws.send('a'.repeat(70000));assert.equal((await bad.wait('ERROR')).code,'FRAME_TOO_LARGE');await pause();assert.equal(bad.closed,true);
  good.send({type:'PING'});assert.equal((await good.wait('PONG')).type,'PONG');
});
test('separate message rate and aggregate packet budgets reject floods without disrupting valid peers',async t=>{
  const f=await fixture(t,{rateLimitMaxMessages:2,maxApplicationPackets:5}),a=await f.client(A),b=await f.client(B);await a.join();await b.join();
  f.auth.messages.set(MSG,{id:MSG,client_message_id:'req',conversation_id:ROOM,sender_id:A,created_at:'2026-10-14T00:00:00Z',edited_at:null,deleted_at:null});
  for(let i=0;i<2;i++){a.send({type:'SEND_MSG',roomId:ROOM,clientMsgId:'req',serverMsgId:MSG});await a.wait('MSG_ACK');}
  a.send({type:'SEND_MSG',roomId:ROOM,clientMsgId:'limit',serverMsgId:MSG});assert.equal((await a.wait('ERROR')).code,'RATE_LIMITED');
  a.send({type:'JOIN_ROOM',roomId:ROOM});await a.wait('ROOM_ACK');a.send({type:'JOIN_ROOM',roomId:ROOM});assert.equal((await a.wait('ERROR')).code,'RATE_LIMITED');
  b.send({type:'PING'});await b.wait('PONG');
});
