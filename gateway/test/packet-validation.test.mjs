import test from 'node:test';
import assert from 'node:assert/strict';
import { validateClientPacket } from '../dist/packet-validation.js';
import { parseFrames } from '../dist/websocket-codec.js';
import { CHUNK_BYTES } from '../dist/protocol.js';
import { A,ROOM,MSG } from './helpers.mjs';
test('strict direction, UUID, integer, Base64 and field bounds',()=>{
  for(const p of [null,[],false,{type:'NEW_MSG'}, {type:'JOIN_ROOM',roomId:'../../file'}, {type:'TYPING',roomId:ROOM,userId:A,isTyping:'yes'}, {type:'FILE_CHUNK',fileId:MSG,chunkIndex:-1,dataBase64:'YQ=='},{type:'FILE_CHUNK',fileId:MSG,chunkIndex:0,dataBase64:'YR=='},{type:'FILE_CHUNK',fileId:MSG,chunkIndex:0.5,dataBase64:'YQ=='},{type:'FILE_COMPLETE',fileId:MSG,downloadUrl:'client-controlled'}])assert.throws(()=>validateClientPacket(p));
  const p={type:'FILE_CHUNK',fileId:MSG,chunkIndex:0,dataBase64:Buffer.alloc(CHUNK_BYTES).toString('base64')};assert.deepEqual(validateClientPacket(p),p);assert.ok(Buffer.byteLength(JSON.stringify(p))<64*1024);
});
test('frame budget rejects announced length before payload or mask allocation',()=>{
  const header=Buffer.alloc(10);header[0]=0x81;header[1]=0xff;header.writeBigUInt64BE(70000n,2);assert.throws(()=>parseFrames(header,65536),/FRAME_TOO_LARGE/);
  const short=Buffer.from([0x81,0xfe,0x10,0x00]);assert.throws(()=>parseFrames(short,1024),/FRAME_TOO_LARGE/);
});
