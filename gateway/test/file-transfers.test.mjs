import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { FileTransfers } from '../dist/file-transfers.js';
import { CHUNK_BYTES } from '../dist/protocol.js';
import { fixture,A,B,C,ROOM,MSG,pause } from './helpers.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
const packet=(bytes,extra={})=>({type:'FILE_START',roomId:ROOM,fileName:'../windows\\..\\payload.txt',fileSize:bytes.length,mimeType:'text/plain',totalChunks:Math.ceil(bytes.length/CHUNK_BYTES),sha256:digest(bytes),...extra});
const session=(user=A)=>({userId:user,sessionId:user,token:user,expiresAt:Date.now()+60000});
async function manager(t,limits={},clock=Date.now){const root=await fs.mkdtemp(path.join(os.tmpdir(),'chatflow-files-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const m=new FileTransfers(root,limits,undefined,clock);await m.initialize();return {m,root};}
async function write(m,s,bytes,extra={}){const d=await m.start(s,packet(bytes,extra));for(let i=0;i<d.totalChunks;i++)await m.chunk(s,d.fileId,i,bytes.subarray(i*CHUNK_BYTES,Math.min((i+1)*CHUNK_BYTES,bytes.length)));await m.complete(s,d.fileId);return d.fileId;}
test('server UUID filenames, ownership/session isolation, duplicate equality and cumulative integrity',async t=>{
  const {m,root}=await manager(t),bytes=Buffer.alloc(CHUNK_BYTES+5,7),s=session(),d=await m.start(s,packet(bytes));
  assert.match(d.fileId,/^[a-f0-9-]{36}$/);assert.notEqual(d.fileId,MSG);
  await assert.rejects(()=>m.chunk(session(B),d.fileId,0,bytes.subarray(0,CHUNK_BYTES)),/owner/);
  await assert.rejects(()=>m.chunk({...s,sessionId:B},d.fileId,0,bytes.subarray(0,CHUNK_BYTES)),/session/);
  await assert.rejects(()=>m.chunk(s,d.fileId,-1,Buffer.from('x')),/index/);
  await assert.rejects(()=>m.chunk(s,d.fileId,1,Buffer.from('x')),/size\/order/);
  const state=await m.chunk(s,d.fileId,0,bytes.subarray(0,CHUNK_BYTES));assert.equal(state.receivedBytes,CHUNK_BYTES);
  await m.chunk(s,d.fileId,0,bytes.subarray(0,CHUNK_BYTES));assert.equal(state.receivedBytes,CHUNK_BYTES);
  await assert.rejects(()=>m.chunk(s,d.fileId,0,Buffer.alloc(CHUNK_BYTES,1)),/Conflicting/);
  await assert.rejects(()=>m.complete(s,d.fileId),/Incomplete/);
  await m.chunk(s,d.fileId,1,bytes.subarray(CHUNK_BYTES));const manifest=await m.complete(s,d.fileId);assert.equal(manifest.ownerId,A);assert.equal(manifest.roomId,ROOM);
  const canonical=await fs.realpath(root);assert.deepEqual(await fs.readFile(path.join(canonical,'files',d.fileId+'.bin')),bytes);
  assert.deepEqual(await fs.readdir(path.join(canonical,'drafts')),[]);assert.equal(await fs.stat(path.join(canonical,'files',d.fileId+'.bin')).then(v=>v.size),bytes.length);
});
test('file/image/user/global/concurrency budgets and completed quota survive restart',async t=>{
  const {m,root}=await manager(t,{maxFileBytes:20,maxImageBytes:10,perUserBytes:20,globalBytes:25,perUserConcurrent:1,globalConcurrent:2}),s=session();
  await assert.rejects(()=>m.start(s,packet(Buffer.alloc(21))),/size/);await assert.rejects(()=>m.start(s,packet(Buffer.alloc(11),{mimeType:'image/png'})),/size/);
  const d=await m.start(s,packet(Buffer.alloc(15)));await assert.rejects(()=>m.start(s,packet(Buffer.alloc(1))),/concurrency/);
  await assert.rejects(()=>m.start(session(B),packet(Buffer.alloc(11))),/quota/);
  await m.abort(s,d.fileId);const id=await write(m,s,Buffer.alloc(15));
  await assert.rejects(()=>m.start(s,packet(Buffer.alloc(6))),/quota/);
  const resumed=new FileTransfers(root,{maxFileBytes:20,maxImageBytes:10,perUserBytes:20,globalBytes:25,perUserConcurrent:1,globalConcurrent:2});await resumed.initialize();assert.equal(resumed.manifest(id).ownerId,A);await assert.rejects(()=>resumed.start(s,packet(Buffer.alloc(6))),/quota/);
});
test('digest mismatch, disconnect, idle expiry and restart release drafts',async t=>{
  let now=Date.now();const {m,root}=await manager(t,{idleMs:20,perUserConcurrent:1},()=>now),s=session();
  const bad=await m.start(s,packet(Buffer.from('abc'),{sha256:'0'.repeat(64)}));await m.chunk(s,bad.fileId,0,Buffer.from('abc'));await assert.rejects(()=>m.complete(s,bad.fileId),/digest/);
  const idle=await m.start(s,packet(Buffer.from('abc')));now+=21;await m.cleanup();assert.throws(()=>m.draft(s,idle.fileId));
  const disconnect=await m.start(s,packet(Buffer.from('abc')));await m.cleanup(s.sessionId);assert.throws(()=>m.draft(s,disconnect.fileId));
  await m.start(s,packet(Buffer.from('abc')));const resumed=new FileTransfers(root);await resumed.initialize();assert.deepEqual(await fs.readdir(path.join(root,'drafts')),[]);
  await write(resumed,s,Buffer.from('works after restart'));
});
test('symlink directory escape and exclusive final collisions cannot overwrite external files',async t=>{
  const {m,root}=await manager(t),s=session(),bytes=Buffer.from('abc'),d=await m.start(s,packet(bytes));await m.chunk(s,d.fileId,0,bytes);
  const collision=path.join(root,'files',d.fileId+'.bin');await fs.writeFile(collision,'existing', {flag:'wx'});await assert.rejects(()=>m.complete(s,d.fileId));assert.equal(await fs.readFile(collision,'utf8'),'existing');
  const outside=await fs.mkdtemp(path.join(os.tmpdir(),'chatflow-outside-'));t.after(()=>fs.rm(outside,{recursive:true,force:true}));
  const {m:other,root:otherRoot}=await manager(t);await fs.rmdir(path.join(otherRoot,'drafts'));await fs.symlink(outside,path.join(otherRoot,'drafts'),process.platform==='win32'?'junction':'dir');await assert.rejects(()=>other.start(s,packet(bytes)),/Unsafe storage/);assert.deepEqual(await fs.readdir(outside),[]);
});
test('signed capabilities expire, reject tampering and die on restart; no secret in manifests',async t=>{
  let now=Date.now();const {m,root}=await manager(t,{},()=>now),s={...session(),expiresAt:now+100},id=await write(m,s,Buffer.from('abc'));
  const cap=m.capability(s,id);assert.equal(m.verifyCapability(cap).expiresAt,s.expiresAt);assert.throws(()=>m.verifyCapability(cap.slice(0,-3)+'bad'));
  const json=await fs.readFile(path.join(root,'manifests',id+'.json'),'utf8');assert.equal(/token|secret|capability/i.test(json),false);
  const resumed=new FileTransfers(root);await resumed.initialize();assert.throws(()=>resumed.verifyCapability(cap));now+=101;assert.throws(()=>m.verifyCapability(cap),/Expired/);
});
test('chunked HTTP roundtrip: private headers, membership/session revocation, authenticated recipient links',async t=>{
  const f=await fixture(t),a=await f.client(A),b=await f.client(B),c=await f.client(C);await a.join();await b.join();
  const bytes=Buffer.alloc(CHUNK_BYTES+17,43);a.send(packet(bytes));const start=await a.wait('FILE_ACK');const fileId=start.fileId;assert.equal(start.chunkIndex,-1);
  b.send({type:'FILE_CHUNK',fileId,chunkIndex:0,dataBase64:bytes.subarray(0,CHUNK_BYTES).toString('base64')});assert.equal((await b.wait('ERROR')).code,'REQUEST_FAILED');
  for(let i=0;i<2;i++){a.send({type:'FILE_CHUNK',fileId,chunkIndex:i,dataBase64:bytes.subarray(i*CHUNK_BYTES,Math.min((i+1)*CHUNK_BYTES,bytes.length)).toString('base64')});assert.equal((await a.wait('FILE_ACK')).chunkIndex,i);}
  a.send({type:'FILE_COMPLETE',fileId});const complete=await a.wait('FILE_READY');
  const response=await fetch(f.base+complete.downloadUrl);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('content-disposition'),/^attachment/);
  assert.notEqual((await fetch(`${f.base}/uploads/${fileId}`)).status,200);assert.notEqual((await fetch(`${f.base}/uploads/${fileId}/manifest.json`)).status,200);
  c.send({type:'FILE_DOWNLOAD',fileId});assert.equal((await c.wait('ERROR')).code,'REQUEST_FAILED');
  b.send({type:'FILE_DOWNLOAD',fileId});const recipientLink=await b.wait('FILE_READY');assert.equal((await fetch(f.base+recipientLink.downloadUrl)).status,200);
  f.auth.members.delete(B);assert.equal((await fetch(f.base+recipientLink.downloadUrl)).status,403);f.auth.members.delete(A);assert.equal((await fetch(f.base+complete.downloadUrl)).status,403);f.auth.members.add(A);
  a.ws.close();await pause(50);assert.equal((await fetch(f.base+complete.downloadUrl)).status,403);
});
test('FILE_START nonmember and invalid chunks do not create unlimited sessions',async t=>{
  let now=Date.now();
  const f=await fixture(t,{now:()=>now,transferLimits:{perUserConcurrent:1,idleMs:50}}),a=await f.client(A),c=await f.client(C);await a.join();c.send(packet(Buffer.from('abc')));assert.equal((await c.wait('ERROR')).code,'FORBIDDEN');
  a.send(packet(Buffer.from('abc')));const first=await a.wait('FILE_ACK');a.send(packet(Buffer.from('abc')));assert.equal((await a.wait('ERROR')).code,'REQUEST_FAILED');
  a.send({type:'FILE_CHUNK',fileId:first.fileId,chunkIndex:0,dataBase64:Buffer.from('x').toString('base64')});assert.equal((await a.wait('ERROR')).code,'REQUEST_FAILED');
  a.send(packet(Buffer.from('abc')));await a.wait('FILE_ACK');now+=51;await pause(130);a.send(packet(Buffer.from('abc')));await a.wait('FILE_ACK');
});
