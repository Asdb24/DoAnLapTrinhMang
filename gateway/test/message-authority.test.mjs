import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture,A,B,ROOM,OTHER,MSG } from './helpers.mjs';
test('unknown IDs, wrong owner/conversation, uncommitted edits/deletes never ACK',async t=>{
  const f=await fixture(t),a=await f.client(A),b=await f.client(B);await a.join();await b.join();
  const send={type:'SEND_MSG',roomId:ROOM,clientMsgId:'request',serverMsgId:MSG};
  a.send(send);assert.equal((await a.wait('ERROR')).code,'MESSAGE_NOT_VERIFIED');
  const row={id:MSG,client_message_id:'request',conversation_id:OTHER,sender_id:A,created_at:'2026-10-14T00:00:00Z',edited_at:null,deleted_at:null};f.auth.messages.set(MSG,row);
  a.send(send);assert.equal((await a.wait('ERROR')).code,'MESSAGE_NOT_VERIFIED');row.conversation_id=ROOM;row.sender_id=B;
  a.send(send);assert.equal((await a.wait('ERROR')).code,'MESSAGE_NOT_VERIFIED');row.sender_id=null;
  a.send(send);assert.equal((await a.wait('ERROR')).code,'MESSAGE_NOT_VERIFIED');row.sender_id=A;
  a.send({...send,clientMsgId:'forged-request'});assert.equal((await a.wait('ERROR')).code,'MESSAGE_NOT_VERIFIED');
  a.send({type:'EDIT_MSG',roomId:ROOM,messageId:MSG});assert.equal((await a.wait('ERROR')).code,'MESSAGE_NOT_VERIFIED');
  a.send({type:'DELETE_MSG',roomId:ROOM,messageId:MSG});assert.equal((await a.wait('ERROR')).code,'MESSAGE_NOT_VERIFIED');
  assert.equal(b.packets.some(p=>p.type==='MESSAGE_CHANGED'),false);
});
test('verified create/edit/delete broadcast only IDs; duplicate notification has no mutation',async t=>{
  const f=await fixture(t),a=await f.client(A),b=await f.client(B);await a.join();await b.join();
  const row={id:MSG,client_message_id:'request',conversation_id:ROOM,sender_id:A,created_at:'2026-10-14T00:00:00Z',edited_at:null,deleted_at:null,content:'private DB content',media:{url:'private'}};f.auth.messages.set(MSG,row);
  for(const event of ['created','created','edited','deleted']){
    if(event==='edited')row.edited_at='2026-10-14T00:01:00Z';if(event==='deleted')row.deleted_at='2026-10-14T00:02:00Z';
    a.send(event==='created'?{type:'SEND_MSG',roomId:ROOM,clientMsgId:'request',serverMsgId:MSG}:{type:event==='edited'?'EDIT_MSG':'DELETE_MSG',roomId:ROOM,messageId:MSG});
    const ack=await a.wait('MSG_ACK');assert.equal(ack.serverMsgId,MSG);assert.equal(ack.createdAt,row.created_at);assert.equal(ack.event,event);
    assert.deepEqual(await b.wait('MESSAGE_CHANGED'),{type:'MESSAGE_CHANGED',roomId:ROOM,messageId:MSG,event});
  }
  assert.equal(row.content,'private DB content');
});
