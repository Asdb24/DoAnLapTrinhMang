import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ChatFlowGateway } from '../gateway/src/server.ts';
import type { GatewayAuthorizer, StoredMessage } from '../gateway/src/supabase-authorizer.ts';
import { GatewayClient } from '../src/services/gateway-client.ts';

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ROOM='cccccccc-cccc-4ccc-8ccc-cccccccccccc', MESSAGE='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
async function until(check:()=>boolean) {
  const deadline=Date.now()+5000;
  while (!check()) {
    if(Date.now()>deadline) throw new Error('Local two-session flow timed out');
    await new Promise(resolve=>setTimeout(resolve,10));
  }
}

// Real TCP/WebSocket and real frontend adapter. The in-memory provider models
// committed records; the separate PGlite suite verifies the actual SQL/RLS.
test('two frontend sessions reconcile committed send/edit/recall and private file bytes over local sockets', async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'chatflow-adapters-'));
  const rows=new Map<string,StoredMessage & {content:string}>(), members=new Set([A,B]);
  const provider:GatewayAuthorizer={
    async authenticate(token){assert.ok(members.has(token));return {userId:token,expiresAt:Date.now()+60000};},
    async isMember(session,room){return room===ROOM&&members.has(session.userId);},
    async message(_session,id){return rows.get(id)??null;},
    async canObservePresence(){return true;},
  };
  const gateway=new ChatFlowGateway({port:0,uploadDir:root,authorizer:provider});
  const a=new GatewayClient(),b=new GatewayClient();
  const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  const oldUrl=process.env.NEXT_PUBLIC_GATEWAY_URL;
  try {
    await gateway.start();
    Object.defineProperty(globalThis,'window',{value:{},configurable:true});
    process.env.NEXT_PUBLIC_GATEWAY_URL=`ws://127.0.0.1:${gateway.port}`;
    const seenA:string[]=[],seenB:string[]=[];
    a.onMessageChanged(p=>{seenA.push(rows.get(p.messageId)!.content);});
    b.onMessageChanged(p=>{seenB.push(rows.get(p.messageId)!.content);});
    a.connect({id:A,displayName:'Alice',token:A});b.connect({id:B,displayName:'Bob',token:B});
    a.joinRoom(ROOM);b.joinRoom(ROOM);
    await until(()=>a.getStatus()==='CONNECTED'&&b.getStatus()==='CONNECTED');
    // Join packets precede notifications on each socket's serialized queue.
    const row={id:MESSAGE,client_message_id:MESSAGE,conversation_id:ROOM,sender_id:A,created_at:new Date().toISOString(),edited_at:null as string|null,deleted_at:null as string|null,content:'committed'};
    rows.set(MESSAGE,row);
    a.sendChatMessage(ROOM,'forged packet content',MESSAGE,undefined,undefined,MESSAGE);
    await until(()=>seenA.length===1&&seenB.length===1);
    assert.deepEqual(seenB,['committed']);
    row.content='edited in database';row.edited_at=new Date().toISOString();a.editMessage(ROOM,MESSAGE,'forged edit');
    await until(()=>seenB.length===2);assert.equal(seenB[1],'edited in database');
    row.content='';row.deleted_at=new Date().toISOString();a.deleteMessage(ROOM,MESSAGE);
    await until(()=>seenB.length===3);assert.equal(seenB[2],'');
    const bytes=new Uint8Array(32768+17).fill(42);
    const uploaded=await a.uploadFileChunked(new File([bytes],'roundtrip.bin',{type:'application/octet-stream'}),ROOM);
    const link=await b.getFileDownloadUrl(uploaded.fileId);
    assert.deepEqual(new Uint8Array(await (await fetch(link)).arrayBuffer()),bytes);
    members.delete(B);assert.equal((await fetch(link)).status,403);
    a.updateToken(A);await until(()=>a.getStatus()==='CONNECTED');
    a.disconnect();b.disconnect();assert.equal(a.getStatus(),'DISCONNECTED');
  } finally {
    a.disconnect();b.disconnect();await gateway.stop();
    if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else Reflect.deleteProperty(globalThis,'window');
    if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_GATEWAY_URL;else process.env.NEXT_PUBLIC_GATEWAY_URL=oldUrl;
    await rm(root,{recursive:true,force:true});
  }
});
