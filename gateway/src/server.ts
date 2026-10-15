import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { buildUpgradeResponse,computeAcceptKey,parseFrames,encodeFrame,encodeCloseFrame,Opcode,type WebSocketFrame } from './websocket-codec.js';
import { PROTOCOL_VERSION,type ClientPacket,type GatewayPacket,type HelloPacket,type ChangeEvent } from './protocol.js';
import { validateClientPacket,UUID } from './packet-validation.js';
import { SupabaseAuthorizer,type GatewayAuthorizer,type AuthorizedSession } from './supabase-authorizer.js';
import { FileTransfers,type TransferLimits } from './file-transfers.js';

export interface JwtPayload { sub:string; exp:number; [key:string]:unknown }
export function verifyHs256Jwt(token:string,secret:string):JwtPayload|null {
  try {const [head,body,sig,...extra]=token.split('.');if(extra.length||JSON.parse(Buffer.from(head,'base64url').toString()).alg!=='HS256')return null;const expected=createHmac('sha256',secret).update(`${head}.${body}`).digest();const actual=Buffer.from(sig,'base64url');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;const p=JSON.parse(Buffer.from(body,'base64url').toString());return typeof p.sub==='string'&&Number.isSafeInteger(p.exp)&&p.exp*1000>Date.now()?p:null;}catch{return null;}
}
export function createTestJwt(payload:{sub:string;exp?:number;[key:string]:unknown},secret:string):string {const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const body=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',...payload})).toString('base64url');return `${header}.${body}.${createHmac('sha256',secret).update(`${header}.${body}`).digest('base64url')}`;}
export interface GatewayOptions {
  port:number; uploadDir:string; authorizer?:GatewayAuthorizer; supabaseUrl?:string; supabasePublicKey?:string;
  heartbeatIntervalMs?:number; helloTimeoutMs?:number; authorizationTimeoutMs?:number; maxAuthConcurrent?:number;
  rateLimitMaxMessages?:number; rateLimitWindowMs?:number; maxTextFrameBytes?:number; maxQueuedPackets?:number;
  maxConnections?:number; maxApplicationPackets?:number; transferLimits?:TransferLimits; downloadSecret?:string; now?:()=>number;
}
export class ClientConnection {
  readonly id=randomUUID(); joinedRooms=new Set<string>(); session:AuthorizedSession|null=null; alive=true; closed=false;
  queue:Promise<void>=Promise.resolve(); pending=0; timestamps:number[]=[]; messageTimestamps:number[]=[]; authTimestamps:number[]=[]; helloTimer?:NodeJS.Timeout; expiryTimer?:NodeJS.Timeout;
  private buffer=Buffer.alloc(0);
  constructor(readonly socket:Socket,private frameBudget:number) {}
  appendData(chunk:Buffer):WebSocketFrame[] {
    const frames:WebSocketFrame[]=[];
    // Bound accumulation even when one TCP segment contains many frames.
    for(let offset=0;offset<chunk.length;) {
      const count=Math.min(chunk.length-offset,this.frameBudget+14-this.buffer.length);
      if(count<=0)throw new Error('FRAME_TOO_LARGE');
      this.buffer=Buffer.concat([this.buffer,chunk.subarray(offset,offset+count)]);offset+=count;
      const parsed=parseFrames(this.buffer,this.frameBudget);frames.push(...parsed.frames);this.buffer=Buffer.from(parsed.remaining);
    }
    return frames;
  }
  sendPacket(p:GatewayPacket) {if(!this.closed&&this.socket.writable){if(this.socket.writableLength>1024*1024){this.close(1008,'Slow consumer');return;}this.socket.write(encodeFrame(JSON.stringify(p)));}}
  close(code=1000,reason='Closed') {if(this.closed)return;this.closed=true;this.socket.end(encodeCloseFrame(code,reason));const timer=setTimeout(()=>this.socket.destroy(),500);timer.unref();}
}
export class ChatFlowGateway {
  private server=createServer(); private connections=new Map<string,ClientConnection>(); private rooms=new Map<string,Set<ClientConnection>>();
  private heartbeat?:NodeJS.Timeout; private cleanupTimer?:NodeJS.Timeout; private authInFlight=0; private files:FileTransfers; private provider:GatewayAuthorizer;
  private options:Required<Pick<GatewayOptions,'heartbeatIntervalMs'|'helloTimeoutMs'|'authorizationTimeoutMs'|'maxAuthConcurrent'|'rateLimitMaxMessages'|'rateLimitWindowMs'|'maxTextFrameBytes'|'maxQueuedPackets'|'maxConnections'|'now'>> & GatewayOptions;
  constructor(options:GatewayOptions) {
    this.options={heartbeatIntervalMs:25000,helloTimeoutMs:10000,authorizationTimeoutMs:5000,maxAuthConcurrent:32,rateLimitMaxMessages:10,rateLimitWindowMs:5000,maxTextFrameBytes:64*1024,maxQueuedPackets:64,maxConnections:1000,maxApplicationPackets:1000,now:Date.now,...options};
    if(!options.authorizer && (!options.supabaseUrl||!options.supabasePublicKey))throw new Error('A configured RLS authorization provider is required');
    this.provider=options.authorizer??new SupabaseAuthorizer(options.supabaseUrl!,options.supabasePublicKey!,this.options.authorizationTimeoutMs);
    if(['authenticate','isMember','message','canObservePresence'].some(method=>typeof (this.provider as unknown as Record<string,unknown>)[method]!=='function'))throw new Error('Invalid authorization provider');
    for(const key of ['heartbeatIntervalMs','helloTimeoutMs','authorizationTimeoutMs','maxAuthConcurrent','rateLimitMaxMessages','rateLimitWindowMs','maxTextFrameBytes','maxQueuedPackets','maxConnections','maxApplicationPackets'] as const){const value=this.options[key];if(!Number.isSafeInteger(value)||Number(value)<=0)throw new Error('Invalid gateway limit');}
    this.files=new FileTransfers(options.uploadDir,options.transferLimits,options.downloadSecret,this.options.now);
    this.server.on('request',(req,res)=>{void this.http(req,res).catch(()=>{if(!res.headersSent)res.writeHead(403,{'Cache-Control':'private, no-store'});res.end();});});
    this.server.on('upgrade',(req,socket:Socket,head)=>this.upgrade(req,socket,head));
  }
  get port():number {const address=this.server.address();return typeof address==='object'&&address?address.port:this.options.port;}
  private error(c:ClientConnection,code:string,id?:string) {c.sendPacket({type:'ERROR',code,message:code,id});}
  private valid(c:ClientConnection):c is ClientConnection & {session:AuthorizedSession} {return !c.closed&&this.connections.has(c.id)&&!!c.session&&c.session.expiresAt>this.options.now();}
  private async bounded<T>(work:()=>Promise<T>):Promise<T> {let timer:NodeJS.Timeout|undefined;try{return await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Authorization timeout')),this.options.authorizationTimeoutMs);})]);}finally{if(timer)clearTimeout(timer);}}
  private async member(c:ClientConnection,room:string,joined=true):Promise<boolean> {if(!this.valid(c)||joined&&!c.joinedRooms.has(room))return false;const allowed=await this.bounded(()=>this.provider.isMember(c.session!,room));if(!allowed)this.leave(c,room);return allowed&&this.valid(c);}
  private leave(c:ClientConnection,room:string) {c.joinedRooms.delete(room);const members=this.rooms.get(room);members?.delete(c);if(members?.size===0)this.rooms.delete(room);}
  private upgrade(req:IncomingMessage,socket:Socket,head:Buffer) {
    const key=req.headers['sec-websocket-key'];
    if(req.headers.upgrade?.toLowerCase()!=='websocket'||typeof key!=='string'||!/^[A-Za-z0-9+/]{22}==$/.test(key)||req.headers['sec-websocket-version']!=='13'||this.connections.size>=this.options.maxConnections){socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');return;}
    socket.write(buildUpgradeResponse(computeAcceptKey(key)));
    const c=new ClientConnection(socket,this.options.maxTextFrameBytes);this.connections.set(c.id,c);
    c.helloTimer=setTimeout(()=>c.close(4001,'HELLO deadline'),this.options.helloTimeoutMs);
    const onData=(chunk:Buffer)=>{try {for(const frame of c.appendData(chunk))this.frame(c,frame);}catch(e){this.error(c,e instanceof Error&&e.message==='FRAME_TOO_LARGE'?'FRAME_TOO_LARGE':'PROTOCOL_ERROR');c.close(1009,'Invalid frame');}};
    socket.on('data',onData);socket.on('close',()=>this.disconnect(c));socket.on('error',()=>socket.destroy());if(head.length)onData(head);
  }
  private frame(c:ClientConnection,f:WebSocketFrame) {
    if(!f.masked||!f.fin||f.opcode===Opcode.CONTINUATION||f.opcode===Opcode.BINARY){c.close(1002,'Invalid client frame');return;}
    if(f.opcode===Opcode.PING){c.socket.write(encodeFrame(f.payload,Opcode.PONG));return;}
    if(f.opcode===Opcode.PONG){c.alive=true;return;}
    if(f.opcode===Opcode.CLOSE){c.close();return;}
    if(f.opcode!==Opcode.TEXT||c.closed)return;
    let packet:ClientPacket;
    try {packet=validateClientPacket(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(f.payload)));}catch{this.error(c,'INVALID_PACKET');return;}
    if(packet.type==='PING'||packet.type==='PONG'){c.alive=true;if(packet.type==='PING')c.sendPacket({type:'PONG'});return;}
    if(c.pending>=this.options.maxQueuedPackets){this.error(c,'QUEUE_LIMIT');c.close(1008,'Queue limit');return;}
    c.pending++;
    c.queue=c.queue.then(async()=>{if(!c.closed)await this.dispatch(c,packet);}).catch(()=>{this.error(c,packet.type==='HELLO'?'AUTH_FAILED':'REQUEST_FAILED',packet.id);if(packet.type==='HELLO')c.close(4001,'Authentication failed');}).finally(()=>{c.pending--;});
  }
  private async hello(c:ClientConnection,p:HelloPacket) {
    if(p.version!==PROTOCOL_VERSION){this.error(c,'PROTOCOL_VERSION',p.id);c.close(4002,'Protocol version');return;}
    c.authTimestamps=c.authTimestamps.filter(time=>this.options.now()-time<5000);
    if(this.authInFlight>=this.options.maxAuthConcurrent||c.authTimestamps.length>=5)throw new Error('Auth busy');c.authTimestamps.push(this.options.now());
    this.authInFlight++;let identity;
    try {identity=await this.bounded(()=>this.provider.authenticate(p.token));}finally{this.authInFlight--;}
    if(c.closed||!this.connections.has(c.id))return;
    if(!UUID.test(identity.userId)||!Number.isSafeInteger(identity.expiresAt)||identity.expiresAt<=this.options.now()||c.session&&c.session.userId!==identity.userId)throw new Error('Invalid session');
    const first=!c.session;c.session={...identity,token:p.token,sessionId:c.id};
    if(c.helloTimer)clearTimeout(c.helloTimer);if(c.expiryTimer)clearTimeout(c.expiryTimer);
    const expire=()=>{if(!this.valid(c)){c.close(4001,'Credentials expired');return;}c.expiryTimer=setTimeout(expire,Math.min(c.session!.expiresAt-this.options.now(),2147483647));};
    c.expiryTimer=setTimeout(expire,Math.min(identity.expiresAt-this.options.now(),2147483647));
    for(const room of c.joinedRooms)await this.member(c,room);
    if(!this.valid(c))return;
    c.sendPacket({type:'WELCOME',version:PROTOCOL_VERSION,sessionId:c.id,userId:identity.userId,expiresAt:identity.expiresAt,serverTime:this.options.now(),heartbeatIntervalMs:this.options.heartbeatIntervalMs,id:p.id});
    if(first)await this.presence(identity.userId,'online');
  }
  private async dispatch(c:ClientConnection,p:ClientPacket) {
    if(p.type==='HELLO'){await this.hello(c,p);return;}
    if(!this.valid(c)){this.error(c,'UNAUTHORIZED',p.id);return;}
    const now=this.options.now();c.timestamps=c.timestamps.filter(t=>now-t<this.options.rateLimitWindowMs);
    if(c.timestamps.length>=this.options.maxApplicationPackets!){this.error(c,'RATE_LIMITED',p.id);return;}c.timestamps.push(now);
    if(p.type==='SEND_MSG'){c.messageTimestamps=c.messageTimestamps.filter(t=>now-t<this.options.rateLimitWindowMs);if(c.messageTimestamps.length>=this.options.rateLimitMaxMessages){this.error(c,'RATE_LIMITED',p.id);return;}c.messageTimestamps.push(now);}
    if(p.type==='JOIN_ROOM'){if(!await this.member(c,p.roomId,false)){this.error(c,'FORBIDDEN',p.id);return;}c.joinedRooms.add(p.roomId);if(!this.rooms.has(p.roomId))this.rooms.set(p.roomId,new Set());this.rooms.get(p.roomId)!.add(c);c.sendPacket({type:'ROOM_ACK',roomId:p.roomId,status:'joined',id:p.id});return;}
    if(p.type==='LEAVE_ROOM'){this.leave(c,p.roomId);c.sendPacket({type:'ROOM_ACK',roomId:p.roomId,status:'left',id:p.id});return;}
    if(p.type==='PRESENCE'){await this.presence(c.session.userId,p.status);return;}
    if(p.type==='SEND_MSG'||p.type==='EDIT_MSG'||p.type==='DELETE_MSG') {
      if(!await this.member(c,p.roomId)){this.error(c,'FORBIDDEN',p.id);return;}
      const id=p.type==='SEND_MSG'?p.serverMsgId:p.messageId;
      const m=await this.bounded(()=>this.provider.message(c.session!,id));
      const event:ChangeEvent=p.type==='SEND_MSG'?'created':p.type==='EDIT_MSG'?'edited':'deleted';
      if(!m||m.id!==id||m.conversation_id!==p.roomId||m.sender_id!==c.session.userId||p.type==='SEND_MSG'&&m.client_message_id!==p.clientMsgId||event==='created'&&!!m.deleted_at||event==='edited'&&(!m.edited_at||!!m.deleted_at)||event==='deleted'&&!m.deleted_at){this.error(c,'MESSAGE_NOT_VERIFIED',p.id);return;}
      if(!await this.member(c,p.roomId))return;
      c.sendPacket({type:'MSG_ACK',clientMsgId:p.type==='SEND_MSG'?p.clientMsgId:p.id??id,serverMsgId:id,roomId:p.roomId,createdAt:m.created_at,event,id:p.id});
      await this.roomDelivery(p.roomId,{type:'MESSAGE_CHANGED',roomId:p.roomId,messageId:id,event});return;
    }
    if(p.type==='TYPING'){if(await this.member(c,p.roomId))await this.roomDelivery(p.roomId,{...p,userId:c.session.userId},c);return;}
    if(p.type==='FILE_START'){if(!await this.member(c,p.roomId)){this.error(c,'FORBIDDEN',p.id);return;}const sessionId=c.id;const d=await this.files.start(c.session,p);if(!this.valid(c)){await this.files.cleanup(sessionId);return;}c.sendPacket({type:'FILE_ACK',fileId:d.fileId,chunkIndex:-1,receivedBytes:0,id:p.id});return;}
    if(p.type==='FILE_CHUNK'||p.type==='FILE_COMPLETE'||p.type==='FILE_ABORT') {
      const d=this.files.draft(c.session,p.fileId);
      if(p.type==='FILE_ABORT'){await this.files.abort(c.session,p.fileId);return;}
      if(!await this.member(c,d.roomId)){await this.files.abort(c.session,p.fileId);this.error(c,'FORBIDDEN',p.id);return;}
      try {
        if(p.type==='FILE_CHUNK'){const state=await this.files.chunk(c.session,p.fileId,p.chunkIndex,Buffer.from(p.dataBase64,'base64'));c.sendPacket({type:'FILE_ACK',fileId:p.fileId,chunkIndex:p.chunkIndex,receivedBytes:state.receivedBytes,id:p.id});}
        else {await this.files.complete(c.session,p.fileId);await this.fileReady(c,p.fileId,p.id);}
      }catch(e){try{await this.files.abort(c.session,p.fileId);}catch{}throw e;}return;
    }
    if(p.type==='FILE_DOWNLOAD'){await this.fileReady(c,p.fileId,p.id);return;}
  }
  private async fileReady(c:ClientConnection,id:string,requestId?:string) {const m=this.files.manifest(id);if(!await this.member(c,m.roomId,false))throw new Error('Forbidden download');const cap=this.files.capability(c.session!,id);c.sendPacket({type:'FILE_READY',fileId:id,downloadUrl:`/uploads/${id}?cap=${encodeURIComponent(cap)}`,id:requestId});}
  private async roomDelivery(room:string,p:GatewayPacket,typingSender?:ClientConnection) {
    for(const recipient of [...this.rooms.get(room)??[]]) {
      try {if(recipient===typingSender||!await this.member(recipient,room))continue;if(typingSender&&!await this.bounded(()=>this.provider.canObservePresence(recipient.session!,typingSender.session!.userId)))continue;if(this.valid(recipient))recipient.sendPacket(p);}catch{/* Fail closed for this recipient; healthy peers continue. */}
    }
  }
  private async presence(userId:string,status:'online'|'away'|'offline') {
    for(const c of this.connections.values()) {try{if(this.valid(c)&&await this.bounded(()=>this.provider.canObservePresence(c.session!,userId))&&this.valid(c))c.sendPacket({type:'PRESENCE',userId,status});}catch{/* Provider failure never opens visibility. */}}
  }
  private disconnect(c:ClientConnection) {
    if(!this.connections.delete(c.id))return;c.closed=true;
    if(c.helloTimer)clearTimeout(c.helloTimer);if(c.expiryTimer)clearTimeout(c.expiryTimer);
    for(const room of c.joinedRooms)this.leave(c,room);
    void c.queue.then(()=>this.files.cleanup(c.id)).catch(()=>{});
    if(c.session&&![...this.connections.values()].some(peer=>this.valid(peer)&&peer.session.userId===c.session!.userId))void this.presence(c.session.userId,'offline').catch(()=>{});
  }
  private async http(req:IncomingMessage,res:ServerResponse) {
    const url=new URL(req.url??'/','http://localhost');
    if(req.method==='GET'&&url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({status:'online',service:'ChatFlow Gateway (RFC 6455)',version:PROTOCOL_VERSION}));return;}
    if(req.method==='GET'&&/^\/uploads\/[a-f0-9-]{36}$/i.test(url.pathname)) {
      const cap=this.files.verifyCapability(url.searchParams.get('cap')??'');const id=url.pathname.slice('/uploads/'.length);
      const c=this.connections.get(cap.sessionId),m=this.files.manifest(id);
      if(cap.fileId!==id||cap.roomId!==m.roomId||!c||!this.valid(c)||cap.userId!==c.session.userId||cap.expiresAt>c.session.expiresAt||!await this.member(c,m.roomId,false))throw new Error('Unauthorized download');
      const stream=await this.files.read(id);if(!this.valid(c)){stream.destroy();throw new Error('Expired session');}
      res.writeHead(200,{'Content-Length':m.fileSize,'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(m.fileName)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
      stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
    }
    res.writeHead(404,{'Cache-Control':'private, no-store'});res.end('Not Found');
  }
  async start():Promise<void> {
    await this.files.initialize();
    await new Promise<void>((resolve,reject)=>{this.server.once('error',reject);this.server.listen(this.options.port,'0.0.0.0',()=>{this.server.off('error',reject);resolve();});});
    this.heartbeat=setInterval(()=>{for(const c of this.connections.values()){if(!c.alive)c.close(1001,'Heartbeat timeout');else{c.alive=false;if(!c.closed)c.socket.write(encodeFrame('',Opcode.PING));}}},this.options.heartbeatIntervalMs);
    this.cleanupTimer=setInterval(()=>{void this.files.cleanup().catch(()=>{});},Math.min(this.options.transferLimits?.idleMs??60000,60000));
  }
  async stop():Promise<void> {
    if(this.heartbeat)clearInterval(this.heartbeat);if(this.cleanupTimer)clearInterval(this.cleanupTimer);
    const clients=[...this.connections.values()];for(const c of clients){c.close(1001,'Shutdown');this.disconnect(c);c.socket.destroy();}
    await Promise.all(clients.map(c=>c.queue));await this.files.cleanup(undefined);
    await new Promise<void>(resolve=>this.server.close(()=>resolve()));
  }
}
