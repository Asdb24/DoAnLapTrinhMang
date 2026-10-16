import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { ChatFlowGateway } from '../dist/server.js';
export const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C='cccccccc-cccc-4ccc-8ccc-cccccccccccc',ROOM='dddddddd-dddd-4ddd-8ddd-dddddddddddd',OTHER='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',MSG='ffffffff-ffff-4fff-8fff-ffffffffffff';
export const pause=(ms=30)=>new Promise(r=>setTimeout(r,ms));
// Synthetic JWTs belong only to provider tests; production authenticates through Supabase Auth.
export function createTestJwt(payload,secret) {
  const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const body=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',...payload})).toString('base64url');
  return `${header}.${body}.${createHmac('sha256',secret).update(`${header}.${body}`).digest('base64url')}`;
}
export function provider() {
  const members=new Set([A,B]),messages=new Map(),blocked=new Set();
  return {members,messages,blocked,unavailable:false,
    async authenticate(token){if(![A,B,C].includes(token))throw Error('Invalid token');return {userId:token,expiresAt:Date.now()+60000};},
    async isMember(s,room){if(this.unavailable)throw Error('Provider offline');return room===ROOM&&members.has(s.userId);},
    async message(s,id){if(this.unavailable)throw Error('Provider offline');return messages.get(id)??null;},
    async canObservePresence(s,target){if(this.unavailable)throw Error('Provider offline');return !blocked.has([s.userId,target].sort().join(':'));},
  };
}
export async function fixture(t,options={}) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'chatflow-gateway-'));
  const auth=options.authorizer??provider();const server=new ChatFlowGateway({port:0,uploadDir:root,authorizer:auth,heartbeatIntervalMs:60000,...options});await server.start();
  const clients=[];t.after(async()=>{for(const c of clients)c.ws.close();await server.stop();await fs.rm(root,{recursive:true,force:true});});
  async function client(user) {
    const ws=new WebSocket(`ws://127.0.0.1:${server.port}`),packets=[];let closed=false;
    ws.addEventListener('message',e=>packets.push(JSON.parse(e.data)));ws.addEventListener('close',()=>{closed=true;});
    await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
    const c={ws,packets,get closed(){return closed;},send(p){ws.send(JSON.stringify(p));},async wait(type,predicate=()=>true){const start=Date.now();while(Date.now()-start<2000){const index=packets.findIndex(p=>p.type===type&&predicate(p));if(index>=0)return packets.splice(index,1)[0];await pause(5);}throw Error('Timeout waiting for '+type+' '+JSON.stringify(packets));},async join(){c.send({type:'JOIN_ROOM',roomId:ROOM});return c.wait('ROOM_ACK');}};
    clients.push(c);
    if(user){c.send({type:'HELLO',version:'2.0',userId:user,displayName:'Test user',token:user});await c.wait('WELCOME');}
    return c;
  }
  return {server,auth,client,root,base:`http://127.0.0.1:${server.port}`};
}
