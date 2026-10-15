import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { File as NodeFile } from 'node:buffer';
import { GatewayClient } from '@/services/gateway-client';
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',ROOM='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',MESSAGE='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
class FakeSocket {
  static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;static instances:FakeSocket[]=[];
  readyState=0;bufferedAmount=0;sent:Record<string,unknown>[]=[];
  onopen:((event:Event)=>void)|null=null;onmessage:((event:MessageEvent)=>void)|null=null;onclose:((event:CloseEvent)=>void)|null=null;onerror:((event:Event)=>void)|null=null;
  constructor(readonly url:string){FakeSocket.instances.push(this);}
  send(text:string){this.sent.push(JSON.parse(text));}
  close(){this.readyState=3;this.onclose?.(new CloseEvent('close'));}
  open(){this.readyState=1;this.onopen?.(new Event('open'));}
  receive(packet:unknown){this.onmessage?.(new MessageEvent('message',{data:JSON.stringify(packet)}));}
  welcome(expiresAt=Date.now()+3600000){const hello=this.sent.filter(p=>p.type==='HELLO').at(-1)!;this.receive({type:'WELCOME',version:'2.0',id:hello.id,sessionId:MESSAGE,userId:USER,expiresAt,serverTime:Date.now(),heartbeatIntervalMs:25000});}
}
const clients:GatewayClient[]=[];
function connection(){const client=new GatewayClient();clients.push(client);client.connect({id:USER,displayName:'User',token:'token'});return {client,socket:FakeSocket.instances.at(-1)!};}
beforeEach(()=>{FakeSocket.instances=[];vi.stubGlobal('WebSocket',FakeSocket);vi.stubGlobal('crypto',webcrypto);});
afterEach(()=>{for(const c of clients)c.disconnect();clients.length=0;});
describe('gateway authenticated client',()=>{
  it('OPEN only sends HELLO, joins and writes only after matching WELCOME',()=>{
    const {client,socket}=connection();client.joinRoom(ROOM);socket.open();expect(client.getStatus()).toBe('CONNECTING');expect(socket.sent.map(p=>p.type)).toEqual(['HELLO']);
    client.sendChatMessage(ROOM,'forged body','request',undefined,undefined,MESSAGE);expect(socket.sent).toHaveLength(1);
    socket.welcome();expect(client.getStatus()).toBe('CONNECTED');expect(socket.sent.at(-1)).toEqual({type:'JOIN_ROOM',roomId:ROOM});
    client.sendChatMessage(ROOM,'forged body','request',[{id:'file',name:'x',url:'untrusted',size:1,mimeType:'text/plain'}],{url:'untrusted'},MESSAGE,'fake date');
    expect(socket.sent.at(-1)).toEqual({type:'SEND_MSG',roomId:ROOM,clientMsgId:'request',serverMsgId:MESSAGE});client.editMessage(ROOM,MESSAGE,'forged edit');expect(socket.sent.at(-1)).toEqual({type:'EDIT_MSG',roomId:ROOM,messageId:MESSAGE});
  });
  it('refresh waits for same-user ACK and expiry cannot leave CONNECTED status',()=>{
    vi.useFakeTimers();const {client,socket}=connection();socket.open();socket.welcome(Date.now()+100);client.updateToken('new-token');expect(client.getStatus()).toBe('CONNECTING');
    client.sendTyping(ROOM,true);expect(socket.sent.at(-1)?.type).toBe('HELLO');expect(socket.sent.at(-1)?.token).toBe('new-token');
    socket.welcome(Date.now()+1000);vi.advanceTimersByTime(101);expect(client.getStatus()).toBe('CONNECTED');vi.advanceTimersByTime(900);expect(client.getStatus()).toBe('DISCONNECTED');
  });
  it('a stale socket close/message does not overwrite a new authenticated connection',()=>{
    const first=connection();first.socket.open();first.socket.welcome();const oldClose=first.socket.onclose!,oldMessage=first.socket.onmessage!;
    first.client.disconnect();first.client.connect({id:USER,displayName:'User',token:'second-token'});const second=FakeSocket.instances.at(-1)!;second.open();second.welcome();
    oldClose(new CloseEvent('close'));oldMessage(new MessageEvent('message',{data:JSON.stringify({type:'ERROR',code:'UNAUTHORIZED',message:'old'})}));expect(first.client.getStatus()).toBe('CONNECTED');expect(second.readyState).toBe(1);
  });
  it('successive refreshes serialize HELLO and acknowledge the latest token before joining',()=>{
    const {client,socket}=connection();client.joinRoom(ROOM);socket.open();client.updateToken('new-token');expect(socket.sent.filter(p=>p.type==='HELLO')).toHaveLength(1);
    socket.welcome();expect(client.getStatus()).toBe('CONNECTING');expect(socket.sent.filter(p=>p.type==='HELLO')).toHaveLength(2);expect(socket.sent.at(-1)?.token).toBe('new-token');expect(socket.sent.some(p=>p.type==='JOIN_ROOM')).toBe(false);
    socket.welcome();expect(client.getStatus()).toBe('CONNECTED');expect(socket.sent.at(-1)?.type).toBe('JOIN_ROOM');
  });
  it('legacy/full payloads, malformed notification UUIDs and unvalidated activity cannot mutate callers',()=>{
    const {client,socket}=connection(),changed=vi.fn(),presence=vi.fn(),typing=vi.fn();client.onMessageChanged(changed);client.onPresence(presence);client.onTyping(typing);socket.open();
    socket.receive({type:'MESSAGE_CHANGED',roomId:ROOM,messageId:MESSAGE,event:'created'});expect(changed).not.toHaveBeenCalled();socket.welcome();
    for(const p of [{type:'NEW_MSG',msg:{id:MESSAGE,content:'forged'}},{type:'MSG_EDITED',roomId:ROOM,messageId:MESSAGE,newContent:'forged'},{type:'MESSAGE_CHANGED',roomId:ROOM,messageId:'unknown',event:'created'},{type:'MESSAGE_CHANGED',roomId:ROOM,messageId:MESSAGE,event:'edited',content:'forged'},{type:'MESSAGE_CHANGED',roomId:ROOM,messageId:MESSAGE,event:'invented'}])socket.receive(p);
    socket.receive({type:'PRESENCE',userId:USER,status:'invented'});socket.receive({type:'TYPING',roomId:ROOM,userId:USER,isTyping:'yes'});expect(changed).not.toHaveBeenCalled();expect(presence).not.toHaveBeenCalled();expect(typing).not.toHaveBeenCalled();
    const packet={type:'MESSAGE_CHANGED',roomId:ROOM,messageId:MESSAGE,event:'deleted'};socket.receive(packet);expect(changed).toHaveBeenCalledWith(packet);
    socket.receive({type:'PRESENCE',userId:USER,status:'online'});socket.receive({type:'TYPING',roomId:ROOM,userId:USER,isTyping:true});expect(presence).toHaveBeenCalledOnce();expect(typing).toHaveBeenCalledOnce();
  });
  it('HELLO timeout and mismatched identity/version WELCOME fail closed',()=>{
    vi.useFakeTimers();const first=connection();first.socket.open();vi.advanceTimersByTime(10001);expect(first.client.getStatus()).toBe('DISCONNECTED');
    const second=connection();second.socket.open();const hello=second.socket.sent[0];second.socket.receive({type:'WELCOME',id:hello.id,version:'1.0',userId:USER,expiresAt:Date.now()+10000});expect(second.client.getStatus()).toBe('DISCONNECTED');
  });
  it('upload waits for server UUID and each ACK; 32KiB chunk fits 64KiB frame',async()=>{
    const {client,socket}=connection();socket.open();socket.welcome();const progress=vi.fn();const file=new NodeFile([new Uint8Array(32768+4)],'../../display.txt',{type:'text/plain'}) as unknown as File;
    const upload=client.uploadFileChunked(file,ROOM,progress);await vi.waitFor(()=>expect(socket.sent.at(-1)?.type).toBe('FILE_START'));
    const start=socket.sent.at(-1)!;expect(start.roomId).toBe(ROOM);expect(start.fileId).toBeUndefined();expect(start.sha256).toMatch(/^[a-f0-9]{64}$/);expect(socket.sent.some(p=>p.type==='FILE_CHUNK')).toBe(false);
    socket.receive({type:'FILE_ACK',id:start.id,fileId:MESSAGE,chunkIndex:-1,receivedBytes:0});await vi.waitFor(()=>expect(socket.sent.at(-1)?.type).toBe('FILE_CHUNK'));
    const chunk=socket.sent.at(-1)!;expect(chunk.chunkIndex).toBe(0);expect(Buffer.from(String(chunk.dataBase64),'base64')).toHaveLength(32768);expect(Buffer.byteLength(JSON.stringify(chunk))).toBeLessThan(65536);await Promise.resolve();expect(socket.sent.filter(p=>p.type==='FILE_CHUNK')).toHaveLength(1);
    socket.receive({type:'FILE_ACK',id:chunk.id,fileId:MESSAGE,chunkIndex:0,receivedBytes:32768});await vi.waitFor(()=>expect(socket.sent.at(-1)?.chunkIndex).toBe(1));const last=socket.sent.at(-1)!;
    socket.receive({type:'FILE_ACK',id:last.id,fileId:MESSAGE,chunkIndex:1,receivedBytes:file.size});await vi.waitFor(()=>expect(socket.sent.at(-1)?.type).toBe('FILE_COMPLETE'));const complete=socket.sent.at(-1)!;expect(complete.downloadUrl).toBeUndefined();
    socket.receive({type:'FILE_READY',id:complete.id,fileId:MESSAGE,downloadUrl:`/uploads/${MESSAGE}?cap=signed`});expect((await upload).fileId).toBe(MESSAGE);expect(progress.mock.calls.map(args=>args[0])).toEqual([100,100]);
  });
  it('request error/connection loss rejects upload and removes pending timeout',async()=>{
    vi.useFakeTimers();const {client,socket}=connection();socket.open();socket.welcome();const file=new NodeFile(['abc'],'x.txt') as unknown as File;
    const upload=client.uploadFileChunked(file,ROOM);const rejection=expect(upload).rejects.toThrow('FORBIDDEN');await vi.waitFor(()=>expect(socket.sent.at(-1)?.type).toBe('FILE_START'));const start=socket.sent.at(-1)!;socket.receive({type:'ERROR',id:start.id,code:'FORBIDDEN',message:'not a member'});await rejection;expect(socket.sent.some(p=>p.type==='FILE_CHUNK')).toBe(false);
    client.disconnect();expect(vi.getTimerCount()).toBe(0);
  });
});
