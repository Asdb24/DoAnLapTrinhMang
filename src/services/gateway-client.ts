import { PROTOCOL_VERSION, CHUNK_BYTES, type GatewayPacket, type ClientPacket, type MessageChangedPacket, type MsgAckPacket, type TypingPacket, type PresencePacket, type ErrorPacket, type HelloPacket, type FileAckPacket, type FileCompletePacket } from '../../gateway/src/protocol';
export type GatewayConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED';
export interface GatewayUser { id:string; displayName:string; avatarUrl?:string; token?:string }
export type MessageChangedHandler = (packet:MessageChangedPacket)=>void;
export type MsgAckHandler=(ack:MsgAckPacket)=>void;
export type TypingHandler=(packet:TypingPacket)=>void;
export type PresenceHandler=(packet:PresencePacket)=>void;
export type StatusHandler=(status:GatewayConnectionStatus)=>void;
export type ErrorHandler=(packet:ErrorPacket)=>void;
type PendingRequest={resolve:(packet:GatewayPacket)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class GatewayClient {
  private ws:WebSocket|null=null;private user:GatewayUser|null=null;private currentRoomId:string|null=null;
  private status:GatewayConnectionStatus='DISCONNECTED';private authenticated=false;private shouldReconnect=false;
  private reconnectTimer:ReturnType<typeof setTimeout>|null=null;private authTimer:ReturnType<typeof setTimeout>|null=null;private expiryTimer:ReturnType<typeof setTimeout>|null=null;
  private authRequestId:string|null=null;private authToken:string|null=null;private generation=0;private pending=new Map<string,PendingRequest>();
  private changedHandlers=new Set<MessageChangedHandler>();private ackHandlers=new Set<MsgAckHandler>();private typingHandlers=new Set<TypingHandler>();private presenceHandlers=new Set<PresenceHandler>();private statusHandlers=new Set<StatusHandler>();private errorHandlers=new Set<ErrorHandler>();
  private getGatewayUrl():string {return process.env.NEXT_PUBLIC_GATEWAY_URL||'wss://168-138-160-93.sslip.io';}
  connect(user:GatewayUser,token?:string) {
    if(this.user && this.user.id!==user.id)this.disconnect();
    this.user={...user,token:token||user.token};this.shouldReconnect=true;this.initSocket();
  }
  updateToken(token:string) {if(!this.user)return;this.user.token=token;if(this.ws?.readyState===WebSocket.OPEN)this.hello();}
  private initSocket() {
    if(typeof window==='undefined')return;
    if(this.ws&&(this.ws.readyState===WebSocket.OPEN||this.ws.readyState===WebSocket.CONNECTING))return;
    this.setStatus('CONNECTING');const generation=++this.generation;
    let socket:WebSocket;try{socket=new WebSocket(this.getGatewayUrl());}catch{this.setStatus('DISCONNECTED');this.scheduleReconnect();return;}
    this.ws=socket;
    socket.onopen=()=>{if(generation!==this.generation)return;if(this.reconnectTimer)clearTimeout(this.reconnectTimer);this.reconnectTimer=null;this.hello();};
    socket.onmessage=event=>{if(generation!==this.generation)return;try{const packet=JSON.parse(event.data);if(packet&&typeof packet==='object'&&typeof packet.type==='string')this.incoming(packet);}catch{/* Invalid packets cannot mutate caller state. */}};
    socket.onclose=()=>{if(generation!==this.generation)return;this.authenticated=false;this.authRequestId=null;this.authToken=null;this.clearTimers();this.rejectPending(new Error('Gateway disconnected'));this.ws=null;this.setStatus('DISCONNECTED');if(this.shouldReconnect)this.scheduleReconnect();};
    socket.onerror=()=>{};
  }
  private hello() {
    if(this.authRequestId)return;
    this.authenticated=false;this.setStatus('CONNECTING');
    if(!this.user?.token){this.ws?.close();return;}
    this.authRequestId=crypto.randomUUID();this.authToken=this.user.token;
    const p:HelloPacket={type:'HELLO',version:PROTOCOL_VERSION,token:this.user.token,userId:this.user.id,displayName:this.user.displayName,avatarUrl:this.user.avatarUrl,id:this.authRequestId};
    this.sendPacket(p);if(this.authTimer)clearTimeout(this.authTimer);this.authTimer=setTimeout(()=>this.ws?.close(),10000);
  }
  private incoming(packet:GatewayPacket) {
    if(packet.type==='WELCOME') {
      if(packet.id!==this.authRequestId||packet.version!==PROTOCOL_VERSION||packet.userId!==this.user?.id||!Number.isSafeInteger(packet.expiresAt)||packet.expiresAt<=Date.now()){this.ws?.close();return;}
      this.authRequestId=null;
      if(this.authToken!==this.user?.token){this.hello();return;}
      this.authenticated=true;if(this.authTimer)clearTimeout(this.authTimer);this.authTimer=null;
      if(this.expiryTimer)clearTimeout(this.expiryTimer);
      const expire=()=>{const remaining=packet.expiresAt-Date.now();if(remaining<=0){this.authenticated=false;this.ws?.close();return;}this.expiryTimer=setTimeout(expire,Math.min(remaining,2147483647));};
      this.expiryTimer=setTimeout(expire,Math.min(packet.expiresAt-Date.now(),2147483647));
      this.setStatus('CONNECTED');if(this.currentRoomId)this.sendPacket({type:'JOIN_ROOM',roomId:this.currentRoomId});return;
    }
    if(packet.type==='PING'){this.sendPacket({type:'PONG'});return;}
    if(packet.type==='ERROR') {
      if(packet.id){const request=this.pending.get(packet.id);if(request){clearTimeout(request.timer);this.pending.delete(packet.id);request.reject(new Error(packet.code));}}
      for(const handler of this.errorHandlers)handler(packet);
      if(['AUTH_FAILED','UNAUTHORIZED','PROTOCOL_VERSION'].includes(packet.code)){this.authenticated=false;this.ws?.close();}return;
    }
    if(!this.authenticated)return;
    if(packet.id){const request=this.pending.get(packet.id);if(request){clearTimeout(request.timer);this.pending.delete(packet.id);request.resolve(packet);}}
    switch(packet.type) {
      case 'MESSAGE_CHANGED': if(typeof packet.roomId==='string'&&UUID.test(packet.roomId)&&typeof packet.messageId==='string'&&UUID.test(packet.messageId)&&['created','edited','deleted'].includes(packet.event)&&Object.keys(packet).every(k=>['type','roomId','messageId','event','id','timestamp'].includes(k)))for(const handler of this.changedHandlers)handler(packet);break;
      case 'MSG_ACK':if(UUID.test(packet.roomId)&&UUID.test(packet.serverMsgId)&&typeof packet.clientMsgId==='string'&&packet.clientMsgId.length<=128&&typeof packet.createdAt==='string'&&Number.isFinite(Date.parse(packet.createdAt))&&['created','edited','deleted'].includes(packet.event))for(const handler of this.ackHandlers)handler(packet);break;
      case 'TYPING':if(UUID.test(packet.roomId)&&UUID.test(packet.userId)&&typeof packet.isTyping==='boolean'&&Object.keys(packet).every(k=>['type','roomId','userId','isTyping','id','timestamp'].includes(k)))for(const handler of this.typingHandlers)handler(packet);break;
      case 'PRESENCE':if(UUID.test(packet.userId)&&['online','away','offline'].includes(packet.status)&&Object.keys(packet).every(k=>['type','userId','status','id','timestamp'].includes(k)))for(const handler of this.presenceHandlers)handler(packet);break;
    }
  }
  private clearTimers() {if(this.authTimer)clearTimeout(this.authTimer);if(this.expiryTimer)clearTimeout(this.expiryTimer);this.authTimer=null;this.expiryTimer=null;}
  private rejectPending(error:Error) {for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(error);}this.pending.clear();}
  private scheduleReconnect() {if(this.reconnectTimer)return;this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null;if(this.shouldReconnect)this.initSocket();},3000);}
  private setStatus(status:GatewayConnectionStatus) {this.status=status;for(const handler of this.statusHandlers)handler(status);}
  getStatus() {return this.status;}
  sendPacket(packet:ClientPacket):boolean {
    if(!this.ws||this.ws.readyState!==WebSocket.OPEN||!this.authenticated&&!['HELLO','PING','PONG'].includes(packet.type))return false;
    if(this.ws.bufferedAmount>1024*1024)return false;this.ws.send(JSON.stringify(packet));return true;
  }
  joinRoom(roomId:string){this.currentRoomId=roomId;this.sendPacket({type:'JOIN_ROOM',roomId});}
  leaveRoom(roomId:string){if(this.currentRoomId===roomId)this.currentRoomId=null;this.sendPacket({type:'LEAVE_ROOM',roomId});}
  sendChatMessage(roomId:string,_content:string,clientMsgId:string,_attachments?:Array<{id:string;name:string;size:number;mimeType:string;url:string}>,_media?:unknown,serverMsgId?:string,_createdAt?:string) {
    if(serverMsgId)this.sendPacket({type:'SEND_MSG',roomId,clientMsgId,serverMsgId});
  }
  editMessage(roomId:string,messageId:string,_newContent?:string){this.sendPacket({type:'EDIT_MSG',roomId,messageId});}
  deleteMessage(roomId:string,messageId:string){this.sendPacket({type:'DELETE_MSG',roomId,messageId});}
  sendTyping(roomId:string,isTyping:boolean){if(this.user)this.sendPacket({type:'TYPING',roomId,userId:this.user.id,isTyping});}
  setPresence(status:'online'|'away'|'offline'){if(this.user)this.sendPacket({type:'PRESENCE',userId:this.user.id,status});}
  private request<T extends GatewayPacket>(packet:ClientPacket,expected:T['type']):Promise<T> {
    const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Gateway request timeout'));},30000);this.pending.set(id,{timer,reject,resolve:p=>{if(p.type!==expected)reject(new Error('Unexpected gateway response'));else resolve(p as T);}});if(!this.sendPacket({...packet,id})){clearTimeout(timer);this.pending.delete(id);reject(new Error('Gateway is not authenticated or is busy'));}});
  }
  async uploadFileChunked(file:File,roomId:string,onProgress?:(percent:number)=>void):Promise<{fileId:string;downloadUrl:string}> {
    if(file.size<1||file.size>25*1024*1024||file.type.startsWith('image/')&&file.size>10*1024*1024)throw new Error('File size limit exceeded');
    if(!this.authenticated)throw new Error('Gateway is not authenticated');
    const generation=this.generation;const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());const sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    if(generation!==this.generation||!this.authenticated)throw new Error('Session changed during upload');
    let fileId:string|undefined;
    try {
      const start=await this.request<FileAckPacket>({type:'FILE_START',roomId,fileName:file.name,fileSize:file.size,mimeType:file.type||'application/octet-stream',totalChunks:Math.ceil(file.size/CHUNK_BYTES),sha256},'FILE_ACK');
      if(start.chunkIndex!==-1||start.receivedBytes!==0||typeof start.fileId!=='string'||!UUID.test(start.fileId))throw new Error('Invalid upload start ACK');fileId=start.fileId;
      const chunks=Math.ceil(file.size/CHUNK_BYTES);
      for(let index=0;index<chunks;index++) {
        if(generation!==this.generation||!this.authenticated)throw new Error('Session changed during upload');
        const bytes=new Uint8Array(await file.slice(index*CHUNK_BYTES,Math.min((index+1)*CHUNK_BYTES,file.size)).arrayBuffer());
        let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
        const ack:FileAckPacket=await this.request<FileAckPacket>({type:'FILE_CHUNK',fileId,chunkIndex:index,dataBase64:btoa(binary)},'FILE_ACK');
        if(ack.fileId!==fileId||ack.chunkIndex!==index||ack.receivedBytes!==Math.min((index+1)*CHUNK_BYTES,file.size))throw new Error('Invalid chunk ACK');
        onProgress?.(Math.round(ack.receivedBytes/file.size*100));
      }
      const complete=await this.request<FileCompletePacket>({type:'FILE_COMPLETE',fileId},'FILE_READY');
      if(complete.fileId!==fileId)throw new Error('Invalid completion ACK');return {fileId,downloadUrl:this.downloadUrl(complete.downloadUrl)};
    }catch(e){if(fileId&&generation===this.generation)this.sendPacket({type:'FILE_ABORT',fileId});throw e;}
  }
  private downloadUrl(relative:string) {const base=this.getGatewayUrl().replace(/^wss:/,'https:').replace(/^ws:/,'http:');const result=new URL(relative,base);if(result.origin!==new URL(base).origin||!result.pathname.startsWith('/uploads/'))throw new Error('Invalid download URL');return result.toString();}
  async getFileDownloadUrl(fileId:string):Promise<string> {const response=await this.request<FileCompletePacket>({type:'FILE_DOWNLOAD',fileId},'FILE_READY');if(response.fileId!==fileId)throw new Error('Invalid download ACK');return this.downloadUrl(response.downloadUrl);}
  onMessageChanged(handler:MessageChangedHandler){this.changedHandlers.add(handler);return()=>this.changedHandlers.delete(handler);}
  onMsgAck(handler:MsgAckHandler){this.ackHandlers.add(handler);return()=>this.ackHandlers.delete(handler);}
  onTyping(handler:TypingHandler){this.typingHandlers.add(handler);return()=>this.typingHandlers.delete(handler);}
  onPresence(handler:PresenceHandler){this.presenceHandlers.add(handler);return()=>this.presenceHandlers.delete(handler);}
  onStatus(handler:StatusHandler){this.statusHandlers.add(handler);return()=>this.statusHandlers.delete(handler);}
  onError(handler:ErrorHandler){this.errorHandlers.add(handler);return()=>this.errorHandlers.delete(handler);}
  disconnect(){this.shouldReconnect=false;++this.generation;if(this.reconnectTimer)clearTimeout(this.reconnectTimer);this.reconnectTimer=null;this.clearTimers();this.rejectPending(new Error('Gateway disconnected'));this.ws?.close();this.ws=null;this.user=null;this.currentRoomId=null;this.authenticated=false;this.authRequestId=null;this.authToken=null;this.setStatus('DISCONNECTED');}
}
export const gatewayClient=new GatewayClient();
